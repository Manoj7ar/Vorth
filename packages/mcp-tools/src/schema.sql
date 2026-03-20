CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gitlab_project_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  gitlab_mr_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  change_surface JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mr_id UUID REFERENCES merge_requests(id),
  data JSONB NOT NULL,
  claude_raw JSONB,
  gemini_raw JSONB,
  consensus_raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id UUID REFERENCES hypotheses(id),
  passed BOOLEAN NOT NULL,
  failure_detected BOOLEAN NOT NULL,
  failure_description TEXT,
  metrics JSONB NOT NULL,
  logs TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resilience_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mr_id UUID REFERENCES merge_requests(id),
  overall INTEGER NOT NULL,
  breakdown JSONB NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  critical_failures TEXT[],
  deployment_allowed BOOLEAN NOT NULL,
  recommendation TEXT NOT NULL,
  claude_analysis TEXT,
  fix_mr_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merge_requests_project_mr ON merge_requests(project_id, gitlab_mr_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_mr_id ON hypotheses(mr_id);
CREATE INDEX IF NOT EXISTS idx_experiment_results_hypothesis_id ON experiment_results(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_resilience_scores_mr_id ON resilience_scores(mr_id);
