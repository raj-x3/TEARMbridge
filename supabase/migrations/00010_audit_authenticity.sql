-- 00010_audit_authenticity.sql
-- Module 2.2: Audit Authenticity, TRUNCATE Protection & Secure Append-Only Architecture
--
-- 1. TRUNCATE Protection:
--    - Normal application roles (authenticated, anon, public) cannot TRUNCATE audit_events.
--    - A BEFORE TRUNCATE statement-level trigger blocks any unauthorized truncation attempt.
--    - Privilege boundary note: superusers and PostgreSQL infrastructure admins bypass triggers/grants.
--
-- 2. Audit Event Authenticity & Revocation of Direct INSERT:
--    - Revoke direct INSERT on audit_events from authenticated, anon, and public roles.
--    - Drop client-side direct INSERT RLS policy.
--    - Prevent authenticated clients from arbitrarily forging event types, actor IDs, or workspace IDs.
--    - Restrict event types via a strict CHECK constraint.
--
-- 3. Secure Append Function (append_audit_event):
--    - Narrowly scoped SECURITY DEFINER function with strict parameter validation.
--    - Derives actor identity strictly from auth.uid() (or 'system' in trusted background server contexts).
--    - Validates that actor belongs to the designated workspace.
--    - Validates that the referenced entity exists within that exact same workspace.
--    - Disallows client metadata attempting to falsely claim unverified payments, invoices, or approvals.
--
-- 4. Automatic Database Mutation Auditing:
--    - Database-generated triggers for critical entity lifecycle transitions
--      (e.g., agreement status changes, purchase order status changes).

-- ============================================================================
-- 1. TRUNCATE PROTECTION TRIGGER & GRANTS
-- ============================================================================

-- Explicitly ensure TRUNCATE is revoked
REVOKE TRUNCATE ON audit_events FROM authenticated, anon, public;

-- Statement-level trigger blocking any TRUNCATE attempt
CREATE OR REPLACE FUNCTION block_audit_events_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are tamper-proof. TRUNCATE operation is prohibited on audit_events.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_block_truncate ON audit_events;
CREATE TRIGGER trg_audit_events_block_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION block_audit_events_truncate();

-- ============================================================================
-- 2. REVOKE DIRECT INSERT & STRICT EVENT_TYPE CONSTRAINT
-- ============================================================================

-- Revoke direct INSERT from application and anonymous clients
REVOKE INSERT ON audit_events FROM authenticated, anon, public;

-- Drop permissive INSERT policy from 00008
DROP POLICY IF EXISTS "Users can insert audit events in their workspaces" ON audit_events;

-- Enforce explicit supported event types constraint
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_event_type;
ALTER TABLE audit_events ADD CONSTRAINT chk_audit_event_type
  CHECK (event_type IN (
    'purchase_order.created',
    'purchase_order.updated',
    'purchase_order.status_changed',
    'agreement.created',
    'agreement.updated',
    'agreement.status_changed',
    'agreement.conflict_resolved',
    'counterparty.created',
    'counterparty.updated',
    'document.uploaded',
    'document.version_added',
    'document.archived',
    'commercial_rule.created',
    'commercial_rule.updated',
    'workspace.updated',
    'workspace.member_added',
    'workspace.member_removed'
  ));

-- ============================================================================
-- 3. SECURE APPEND-ONLY FUNCTION (append_audit_event)
-- ============================================================================

CREATE OR REPLACE FUNCTION append_audit_event(
  p_workspace_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_event_type TEXT,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_new_id UUID;
BEGIN
  -- 1. Derive actor strictly from authenticated session context
  v_actor_id := auth.uid();

  -- If an authenticated user is calling, verify membership in the target workspace
  IF v_actor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = v_actor_id
    ) THEN
      RAISE EXCEPTION 'Access denied. User % is not a member of workspace %.', v_actor_id, p_workspace_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. Reject unverified financial or approval claims in metadata
  IF p_details ? 'payment_verified'
     OR p_details ? 'payment_completed'
     OR p_details ? 'invoice_approved'
     OR p_details ? 'payout_completed'
     OR p_details ? 'paypal_transaction_verified' THEN
    RAISE EXCEPTION 'Unauthorized metadata detected: unverified financial verification claims cannot be submitted by client callers.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. Validate entity existence within the specified workspace
  IF p_entity_type = 'purchase_order' THEN
    IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced purchase_order % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'agreement' THEN
    IF NOT EXISTS (SELECT 1 FROM commercial_agreements WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_agreement % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'counterparty' THEN
    IF NOT EXISTS (SELECT 1 FROM counterparties WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced counterparty % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'document' THEN
    IF NOT EXISTS (SELECT 1 FROM documents WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced document % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'commercial_rule' THEN
    IF NOT EXISTS (SELECT 1 FROM commercial_rules WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_rule % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'workspace' THEN
    IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = p_entity_id AND id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced workspace % does not match target workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported entity_type for audit event: %.', p_entity_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 4. Insert audit record with server-derived actor and timestamp
  INSERT INTO audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    p_workspace_id,
    v_actor_id,
    CASE WHEN v_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
    p_entity_type,
    p_entity_id,
    p_event_type,
    COALESCE(p_details, '{}'::jsonb),
    now()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Grant EXECUTE permission to authenticated and service_role
GRANT EXECUTE ON FUNCTION append_audit_event(UUID, TEXT, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ============================================================================
-- 4. DATABASE-GENERATED AUDIT TRIGGERS FOR KEY MUTATIONS
-- ============================================================================

-- Trigger for commercial agreement status changes
CREATE OR REPLACE FUNCTION audit_agreement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_events (
      workspace_id,
      actor_id,
      actor_type,
      entity_type,
      entity_id,
      event_type,
      details,
      created_at
    ) VALUES (
      NEW.workspace_id,
      auth.uid(),
      CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      'agreement',
      NEW.id,
      'agreement.status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'agreement_reference', NEW.agreement_reference
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agreement_status ON commercial_agreements;
CREATE TRIGGER trg_audit_agreement_status
  AFTER UPDATE OF status ON commercial_agreements
  FOR EACH ROW
  EXECUTE FUNCTION audit_agreement_status_change();

-- Trigger for purchase order status changes
CREATE OR REPLACE FUNCTION audit_purchase_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_events (
      workspace_id,
      actor_id,
      actor_type,
      entity_type,
      entity_id,
      event_type,
      details,
      created_at
    ) VALUES (
      NEW.workspace_id,
      auth.uid(),
      CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      'purchase_order',
      NEW.id,
      'purchase_order.status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'po_number', NEW.po_number
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_purchase_order_status ON purchase_orders;
CREATE TRIGGER trg_audit_purchase_order_status
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_purchase_order_status_change();
