CREATE TABLE review_checkpoints (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  cache_key text NOT NULL CHECK (cache_key ~ '^[a-f0-9]{64}$'),
  phase text NOT NULL CHECK (phase IN ('Review','Security audit','Security verification')),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  reuse_count integer NOT NULL DEFAULT 0 CHECK (reuse_count >= 0),
  PRIMARY KEY (run_id, cache_key)
);
