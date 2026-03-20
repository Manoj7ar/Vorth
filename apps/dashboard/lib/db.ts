import { Pool } from "pg";

interface ProjectOverview {
  gitlab_project_id: number;
  name: string;
  namespace: string;
  latest_score: number | null;
}

interface ProjectView {
  project: {
    id: string;
    name: string;
    namespace: string;
  };
  mergeRequests: Array<{
    gitlab_mr_id: number;
    title: string;
    status: string;
    created_at: string;
    change_surface: unknown;
  }>;
  scoreTrend: Array<{
    overall: number;
    created_at: string;
  }>;
  experiments: Array<{
    passed: boolean;
    duration_seconds: number;
    created_at: string;
    failure_description: string | null;
  }>;
}

interface MergeRequestView {
  title: string;
  author: string;
  source_branch: string;
  status: string;
  claude_analysis: string | null;
  fix_mr_url: string | null;
  score_overall: number | null;
  deployment_allowed: boolean | null;
  recommendation: string | null;
  experiments: Array<{
    passed: boolean;
    failure_detected: boolean;
    failure_description: string | null;
    metrics: {
      errorRate: number;
    };
    logs: string;
    duration_seconds: number;
    data: Array<{
      experimentType: string;
      targetService: string;
    }>;
  }>;
}

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return pool;
}

export async function getProjectsOverview(): Promise<ProjectOverview[]> {
  const result = await getPool().query<ProjectOverview>(
    `SELECT p.gitlab_project_id,
            p.name,
            p.namespace,
            (
              SELECT rs.overall
              FROM resilience_scores rs
              JOIN merge_requests mr ON mr.id = rs.mr_id
              WHERE mr.project_id = p.id
              ORDER BY rs.created_at DESC
              LIMIT 1
            ) AS latest_score
     FROM projects p
     ORDER BY p.name ASC`,
  );

  return result.rows;
}

export async function getProjectView(projectId: number): Promise<ProjectView | null> {
  const projectResult = await getPool().query<{ id: string; name: string; namespace: string }>(
    "SELECT id, name, namespace FROM projects WHERE gitlab_project_id = $1",
    [projectId],
  );

  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

  const [mergeRequests, scoreTrend, experiments] = await Promise.all([
    getPool().query<ProjectView["mergeRequests"][number]>(
      `SELECT gitlab_mr_id, title, status, created_at, change_surface
       FROM merge_requests
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [project.id],
    ),
    getPool().query<ProjectView["scoreTrend"][number]>(
      `SELECT rs.overall, rs.created_at
       FROM resilience_scores rs
       JOIN merge_requests mr ON mr.id = rs.mr_id
       WHERE mr.project_id = $1
       ORDER BY rs.created_at DESC
       LIMIT 30`,
      [project.id],
    ),
    getPool().query<ProjectView["experiments"][number]>(
      `SELECT er.passed, er.duration_seconds, er.created_at, er.failure_description
       FROM experiment_results er
       JOIN hypotheses h ON h.id = er.hypothesis_id
       JOIN merge_requests mr ON mr.id = h.mr_id
       WHERE mr.project_id = $1
       ORDER BY er.created_at DESC
       LIMIT 20`,
      [project.id],
    ),
  ]);

  return {
    project,
    mergeRequests: mergeRequests.rows,
    scoreTrend: scoreTrend.rows,
    experiments: experiments.rows,
  };
}

export async function getMergeRequestView(projectId: number, mrId: number): Promise<MergeRequestView | null> {
  const detailResult = await getPool().query<Omit<MergeRequestView, "experiments">>(
    `SELECT mr.title,
            mr.author,
            mr.source_branch,
            mr.status,
            rs.claude_analysis,
            rs.fix_mr_url,
            rs.overall AS score_overall,
            rs.deployment_allowed,
            rs.recommendation
     FROM merge_requests mr
     JOIN projects p ON p.id = mr.project_id
     LEFT JOIN LATERAL (
       SELECT *
       FROM resilience_scores rs_inner
       WHERE rs_inner.mr_id = mr.id
       ORDER BY rs_inner.created_at DESC
       LIMIT 1
     ) rs ON TRUE
     WHERE p.gitlab_project_id = $1 AND mr.gitlab_mr_id = $2`,
    [projectId, mrId],
  );

  const detail = detailResult.rows[0];
  if (!detail) {
    return null;
  }

  const experiments = await getPool().query<MergeRequestView["experiments"][number]>(
    `SELECT er.passed,
            er.failure_detected,
            er.failure_description,
            er.metrics,
            er.logs,
            er.duration_seconds,
            h.data
     FROM experiment_results er
     JOIN hypotheses h ON h.id = er.hypothesis_id
     JOIN merge_requests mr ON mr.id = h.mr_id
     JOIN projects p ON p.id = mr.project_id
     WHERE p.gitlab_project_id = $1 AND mr.gitlab_mr_id = $2
     ORDER BY er.created_at DESC`,
    [projectId, mrId],
  );

  return {
    ...detail,
    experiments: experiments.rows,
  };
}
