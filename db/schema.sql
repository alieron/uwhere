CREATE TABLE IF NOT EXISTS groups (
  token_hash text PRIMARY KEY
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  name text NOT NULL
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  students jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(students) = 'array' AND jsonb_array_length(students) <= 100),
  revision integer NOT NULL DEFAULT 0
    CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);
