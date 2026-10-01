CREATE INDEX billing_outbox_pending ON billing_outbox(available_at,created_at)
WHERE delivered_at IS NULL;
