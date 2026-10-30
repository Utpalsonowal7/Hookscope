CREATE TABLE IF NOT EXISTS endpoints (
  id uuid PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name varchar(60) NOT NULL,
  response_status integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY,
  endpoint_id uuid NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  method varchar(10) NOT NULL,
  path text NOT NULL,
  query jsonb NOT NULL,
  headers jsonb NOT NULL,
  body bytea NOT NULL,
  body_bytes integer NOT NULL,
  response_status integer NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_endpoint_time ON requests(endpoint_id, received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS requests_endpoint_method ON requests(endpoint_id, method, received_at DESC);
CREATE TABLE IF NOT EXISTS replays (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  target text NOT NULL,
  status integer,
  duration_ms integer NOT NULL,
  response_body text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS replays_request_time ON replays(request_id, created_at DESC);
