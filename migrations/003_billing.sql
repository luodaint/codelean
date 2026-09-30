CREATE TABLE billing_accounts (
  organization_id text PRIMARY KEY REFERENCES organization(id),
  customer_id text UNIQUE,
  subscription_id text UNIQUE,
  subscription_status text NOT NULL DEFAULT 'none',
  provider_updated_at timestamptz,
  period_start timestamptz(3),
  period_end timestamptz(3),
  prepaid_tokens bigint NOT NULL DEFAULT 0 CHECK (prepaid_tokens >= 0),
  extra_limit_cents bigint CHECK (extra_limit_cents >= 0),
  complimentary boolean NOT NULL DEFAULT false,
  complimentary_until timestamptz,
  paused boolean NOT NULL DEFAULT false,
  hold_reason text,
  repository_limit integer NOT NULL DEFAULT 10 CHECK (repository_limit BETWEEN 1 AND 1000),
  hourly_limit integer NOT NULL DEFAULT 6 CHECK (hourly_limit BETWEEN 1 AND 1000),
  last_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_periods (
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id),
  starts_at timestamptz(3) NOT NULL,
  ends_at timestamptz(3) NOT NULL,
  included_used bigint NOT NULL DEFAULT 0 CHECK (included_used >= 0),
  overage_tokens bigint NOT NULL DEFAULT 0 CHECK (overage_tokens >= 0),
  PRIMARY KEY (organization_id, starts_at)
);
CREATE TABLE billing_attempts (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id),
  period_start timestamptz(3),
  period_end timestamptz(3),
  exempt boolean NOT NULL,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_attempts_workspace ON billing_attempts(organization_id, created_at);
CREATE TABLE model_usage (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES billing_attempts(id) ON DELETE CASCADE,
  model text NOT NULL,
  phase text NOT NULL,
  max_tokens bigint NOT NULL CHECK (max_tokens > 0),
  reserved_tokens bigint NOT NULL CHECK (reserved_tokens >= 0),
  total_tokens bigint CHECK (total_tokens >= 0),
  usage jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','succeeded','failed','unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_charges (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id),
  attempt_id uuid NOT NULL REFERENCES billing_attempts(id),
  included_tokens bigint NOT NULL,
  prepaid_tokens bigint NOT NULL,
  overage_tokens bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_outbox (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_webhooks (id text PRIMARY KEY, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE billing_checkouts (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id),
  kind text NOT NULL CHECK (kind IN ('plan','tokens')),
  customer_id text NOT NULL,
  checkout_id text UNIQUE,
  checkout_url text,
  order_id text UNIQUE,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES billing_accounts(organization_id),
  actor_id text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runs ALTER COLUMN tokens TYPE bigint;
