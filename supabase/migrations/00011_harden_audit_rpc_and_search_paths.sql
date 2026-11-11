-- 00011_harden_audit_rpc_and_search_paths.sql
-- Module 2.3: Final Audit RPC Security Review & Search Path Hardening
--
-- 1. Secure Audit RPC Permissions:
--    - Revoke EXECUTE on append_audit_event from PUBLIC, anon, and authenticated.
--    - Grant EXECUTE strictly to service_role (trusted server-side execution only).
--    - Prevents ordinary authenticated users or reviewers from fabricating audit records via PostgREST RPC.
--
-- 2. Automated Database-Generated Mutation Triggers:
--    - Trigger on purchase_orders: AFTER INSERT logs 'purchase_order.created'.
--    - Trigger on commercial_agreements: AFTER INSERT logs 'agreement.created'.
--    - Trigger on counterparties: AFTER INSERT logs 'counterparty.created'.
--    - Trigger on documents: AFTER INSERT logs 'document.uploaded' or 'document.version_added'.
--    - Trigger on commercial_agreements: AFTER UPDATE OF status logs 'agreement.status_changed'.
--    - Trigger on purchase_orders: AFTER UPDATE OF status logs 'purchase_order.status_changed'.
--    - All trigger functions are SECURITY DEFINER with SET search_path = '' so authorized users
--      can mutate entities while trigger securely records the audit row without exposing direct INSERT.
--
-- 3. Harden Search Paths Across ALL SECURITY DEFINER Functions:
--    - Replaces SET search_path = public with SET search_path = ''
--    - Fully qualifies all tables, types, operators, and functions with schema names
--      (public.*, pg_catalog.*, auth.*).

-- ============================================================================
-- 1. HARDEN SECURITY DEFINER SEARCH PATHS ON CORE FUNCTIONS
-- ============================================================================

-- A. Workspace ID resolver for RLS
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids()
RETURNS SETOF pg_catalog.uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

-- B. Updated_at column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- C. Workspace member role resolver
CREATE OR REPLACE FUNCTION public.get_user_workspace_role(p_workspace_id pg_catalog.uuid)
RETURNS pg_catalog.text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- D. Audit events immutability trigger function (blocks UPDATE and DELETE)
CREATE OR REPLACE FUNCTION public.enforce_audit_events_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are cryptographically immutable. UPDATE and DELETE operations are prohibited on audit_events (id: %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- E. Audit events TRUNCATE protection trigger function
CREATE OR REPLACE FUNCTION public.block_audit_events_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are tamper-proof. TRUNCATE operation is prohibited on audit_events.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- F. Polymorphic document link integrity validation trigger function
CREATE OR REPLACE FUNCTION public.validate_polymorphic_document_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc_workspace pg_catalog.uuid;
  v_entity_exists pg_catalog.bool := false;
BEGIN
  -- 1. Verify referenced document exists and belongs to the same workspace
  SELECT workspace_id INTO v_doc_workspace
  FROM public.documents
  WHERE id = NEW.document_id;

  IF v_doc_workspace IS NULL THEN
    RAISE EXCEPTION 'Referenced document % does not exist.', NEW.document_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_doc_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Cross-workspace document linkage prohibited. Document workspace (%) does not match link workspace (%).',
      v_doc_workspace, NEW.workspace_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- 2. Verify target entity exists within the exact same workspace
  IF NEW.entity_type = 'purchase_order' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target purchase_order % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.entity_type = 'agreement' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.commercial_agreements
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target commercial_agreement % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.entity_type = 'counterparty' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.counterparties
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target counterparty % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unsupported polymorphic entity_type: %.', NEW.entity_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. SECURE append_audit_event WITH EMPTY SEARCH PATH & RESTRICTED ACCESS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_audit_event(
  p_workspace_id pg_catalog.uuid,
  p_entity_type pg_catalog.text,
  p_entity_id pg_catalog.uuid,
  p_event_type pg_catalog.text,
  p_details pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id pg_catalog.uuid;
  v_new_id pg_catalog.uuid;
BEGIN
  -- 1. Derive actor strictly from authenticated session context
  v_actor_id := auth.uid();

  -- If an authenticated user is calling, verify membership in the target workspace
  IF v_actor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = v_actor_id
    ) THEN
      RAISE EXCEPTION 'Access denied. User % is not a member of workspace %.', v_actor_id, p_workspace_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. Reject unverified financial or approval claims in metadata
  IF (p_details ? 'payment_verified')
     OR (p_details ? 'payment_completed')
     OR (p_details ? 'invoice_approved')
     OR (p_details ? 'payout_completed')
     OR (p_details ? 'paypal_transaction_verified') THEN
    RAISE EXCEPTION 'Unauthorized metadata detected: unverified financial verification claims cannot be submitted by client callers.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. Validate entity existence within the specified workspace
  IF p_entity_type = 'purchase_order' THEN
    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced purchase_order % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'agreement' THEN
    IF NOT EXISTS (SELECT 1 FROM public.commercial_agreements WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_agreement % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'counterparty' THEN
    IF NOT EXISTS (SELECT 1 FROM public.counterparties WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced counterparty % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'document' THEN
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced document % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'commercial_rule' THEN
    IF NOT EXISTS (SELECT 1 FROM public.commercial_rules WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_rule % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'workspace' THEN
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_entity_id AND id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced workspace % does not match target workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported entity_type for audit event: %.', p_entity_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 4. Insert audit record with server-derived actor and timestamp
  INSERT INTO public.audit_events (
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
    pg_catalog.now()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Revoke all EXECUTE permissions from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.append_audit_event(pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE exclusively to service_role (trusted server-side execution only)
GRANT EXECUTE ON FUNCTION public.append_audit_event(pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb) TO service_role;

-- ============================================================================
-- 3. AUTOMATIC DATABASE MUTATION AUDIT TRIGGERS (SECURITY DEFINER)
-- ============================================================================

-- A. Purchase Order Creation Trigger
CREATE OR REPLACE FUNCTION public.audit_purchase_order_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
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
    'purchase_order.created',
    pg_catalog.jsonb_build_object(
      'po_number', NEW.po_number,
      'total_amount', NEW.total_amount,
      'currency', NEW.currency,
      'buyer_id', NEW.buyer_id
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_purchase_order_creation ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_order_creation
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_purchase_order_creation();

-- B. Purchase Order Status Change Trigger
CREATE OR REPLACE FUNCTION public.audit_purchase_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_events (
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
      pg_catalog.jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'po_number', NEW.po_number
      ),
      pg_catalog.now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_purchase_order_status ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_order_status
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_purchase_order_status_change();

-- C. Agreement Creation Trigger
CREATE OR REPLACE FUNCTION public.audit_agreement_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
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
    'agreement.created',
    pg_catalog.jsonb_build_object(
      'agreement_reference', NEW.agreement_reference,
      'title', NEW.title,
      'currency', NEW.currency,
      'status', NEW.status
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agreement_creation ON public.commercial_agreements;
CREATE TRIGGER trg_audit_agreement_creation
  AFTER INSERT ON public.commercial_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_agreement_creation();

-- D. Agreement Status Change Trigger
CREATE OR REPLACE FUNCTION public.audit_agreement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_events (
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
      pg_catalog.jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'agreement_reference', NEW.agreement_reference
      ),
      pg_catalog.now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agreement_status ON public.commercial_agreements;
CREATE TRIGGER trg_audit_agreement_status
  AFTER UPDATE OF status ON public.commercial_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_agreement_status_change();

-- E. Counterparty Creation Trigger
CREATE OR REPLACE FUNCTION public.audit_counterparty_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
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
    'counterparty',
    NEW.id,
    'counterparty.created',
    pg_catalog.jsonb_build_object(
      'display_name', NEW.display_name,
      'legal_name', NEW.legal_name,
      'entity_type', NEW.entity_type,
      'currency', NEW.currency
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_counterparty_creation ON public.counterparties;
CREATE TRIGGER trg_audit_counterparty_creation
  AFTER INSERT ON public.counterparties
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_counterparty_creation();

-- F. Document Creation Trigger (Uploaded & Version Added)
CREATE OR REPLACE FUNCTION public.audit_document_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
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
    'document',
    NEW.id,
    CASE WHEN NEW.version_number > 1 THEN 'document.version_added' ELSE 'document.uploaded' END,
    pg_catalog.jsonb_build_object(
      'file_name', NEW.file_name,
      'mime_type', NEW.mime_type,
      'file_size_bytes', NEW.file_size_bytes,
      'version_number', NEW.version_number,
      'sha256_hash', NEW.sha256_hash
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_document_creation ON public.documents;
CREATE TRIGGER trg_audit_document_creation
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_document_creation();
