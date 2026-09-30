-- A durable final result replaces batch checkpoints, including when GitHub
-- publication still needs to be retried. Keep cleanup in the same transaction.
CREATE FUNCTION cleanup_review_checkpoints() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM review_checkpoints WHERE run_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_cleanup_review_checkpoints
AFTER UPDATE OF result, status ON runs
FOR EACH ROW
WHEN (NEW.result IS NOT NULL OR NEW.status = 'completed')
EXECUTE FUNCTION cleanup_review_checkpoints();

-- Also clean up runs finalized before this migration was installed.
DELETE FROM review_checkpoints c USING runs r
WHERE c.run_id = r.id AND (r.result IS NOT NULL OR r.status = 'completed');
