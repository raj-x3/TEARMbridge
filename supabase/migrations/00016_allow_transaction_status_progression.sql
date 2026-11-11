-- 00016_allow_transaction_status_progression.sql
-- Allow transaction_status progression while keeping snapshot & financial terms strictly immutable.

CREATE OR REPLACE FUNCTION enforce_finalized_transaction_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Finalized transactions cannot be deleted. Record % is immutable.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- All core terms, hashes, and financial calculations are strictly immutable
  IF NEW.id <> OLD.id
     OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.counteroffer_id <> OLD.counteroffer_id
     OR NEW.counteroffer_version_id <> OLD.counteroffer_version_id
     OR NEW.transaction_snapshot::text <> OLD.transaction_snapshot::text
     OR NEW.snapshot_hash <> OLD.snapshot_hash
     OR NEW.grand_total <> OLD.grand_total
     OR NEW.subtotal <> OLD.subtotal
     OR NEW.discount_total <> OLD.discount_total
     OR NEW.currency <> OLD.currency
  THEN
    RAISE EXCEPTION 'Finalized transaction snapshot data is strictly immutable. Record % cannot be modified.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
