CREATE TABLE IF NOT EXISTS repositories (
  id bigint PRIMARY KEY,
  installation_id bigint NOT NULL,
  full_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  connected boolean NOT NULL DEFAULT true,
  labels_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deliveries (
  id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY,
  repository_id bigint NOT NULL REFERENCES repositories(id),
  pr_number integer NOT NULL,
  title text NOT NULL,
  head_sha text NOT NULL,
  base_sha text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  stage text NOT NULL DEFAULT 'Waiting for a worker',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  result jsonb,
  error text,
  check_id bigint,
  summary_id bigint,
  review_id bigint,
  publication_started boolean NOT NULL DEFAULT false,
  tokens integer NOT NULL DEFAULT 0,
  model text,
  UNIQUE(repository_id, pr_number, head_sha, base_sha)
);
CREATE INDEX IF NOT EXISTS runs_queue ON runs(status, available_at);
CREATE INDEX IF NOT EXISTS runs_history ON runs(created_at DESC);
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  name text PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now()
);
