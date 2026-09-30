CREATE INDEX model_usage_attempt ON model_usage(attempt_id);
CREATE INDEX model_usage_created ON model_usage(created_at);
CREATE INDEX billing_attempts_run ON billing_attempts(run_id);

ALTER TABLE billing_checkouts ADD COLUMN expired_at timestamptz;
ALTER TABLE billing_accounts ADD COLUMN grant_pending jsonb;

CREATE TABLE billing_subscription_history (
  subscription_id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id)
);
CREATE INDEX billing_subscription_history_workspace ON billing_subscription_history(organization_id);
INSERT INTO billing_subscription_history(subscription_id,organization_id)
SELECT subscription_id,organization_id FROM billing_accounts WHERE subscription_id IS NOT NULL;
