import "dotenv-safe/config.js";

import { randomUUID } from "node:crypto";

import { Pool, type QueryResultRow } from "pg";

import {
  type ChangeSurface,
  changeSurfaceSchema,
  type ExperimentResult,
  experimentResultListSchema,
  type Hypothesis,
  hypothesisListSchema,
  type ResilienceScore,
  resilienceScoreSchema,
} from "@vorth/shared-types";
import {
  GitLabClient,
  fetchMergeRequestChanges,
  postMergeRequestComment,
} from "@vorth/gitlab-client";

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return pool;
}

async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

async function ensureProject(project: {
  gitlabProjectId: number;
  name: string;
  namespace: string;
}) {
  const existing = await query<{ id: string }>(
    "SELECT id FROM projects WHERE gitlab_project_id = $1",
    [project.gitlabProjectId],
  );

  if ((existing.rowCount ?? 0) > 0) {
    const current = existing.rows[0];
    if (!current) {
      throw new Error("Project lookup returned no rows.");
    }
    return current.id;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO projects (id, gitlab_project_id, name, namespace)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [randomUUID(), project.gitlabProjectId, project.name, project.namespace],
  );

  const insertedProject = inserted.rows[0];
  if (!insertedProject) {
    throw new Error("Project insert did not return an id.");
  }

  return insertedProject.id;
}

async function ensureMergeRequestRecord(input: {
  projectUuid: string;
  mrId: number;
  title: string;
  author: string;
  sourceBranch: string;
  changeSurface?: ChangeSurface;
  status?: string;
}) {
  const existing = await query<{ id: string }>(
    "SELECT id FROM merge_requests WHERE project_id = $1 AND gitlab_mr_id = $2",
    [input.projectUuid, input.mrId],
  );

  if ((existing.rowCount ?? 0) > 0) {
    const current = existing.rows[0];
    if (!current) {
      throw new Error("Merge request lookup returned no rows.");
    }
    const id = current.id;
    await query(
      `UPDATE merge_requests
       SET title = $1,
           author = $2,
           source_branch = $3,
           change_surface = COALESCE($4::jsonb, change_surface),
           status = COALESCE($5, status)
       WHERE id = $6`,
      [
        input.title,
        input.author,
        input.sourceBranch,
        input.changeSurface ? JSON.stringify(input.changeSurface) : null,
        input.status ?? null,
        id,
      ],
    );
    return id;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO merge_requests (id, project_id, gitlab_mr_id, title, author, source_branch, change_surface, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id`,
    [
      randomUUID(),
      input.projectUuid,
      input.mrId,
      input.title,
      input.author,
      input.sourceBranch,
      input.changeSurface ? JSON.stringify(input.changeSurface) : null,
      input.status ?? "pending",
    ],
  );

  const insertedMergeRequest = inserted.rows[0];
  if (!insertedMergeRequest) {
    throw new Error("Merge request insert did not return an id.");
  }

  return insertedMergeRequest.id;
}

function extractServicesFromFiles(changedFiles: string[]) {
  const services = new Set<string>();

  for (const file of changedFiles) {
    const segments = file.split("/").filter(Boolean);
    const firstSegment = segments[0];

    if (!firstSegment) {
      continue;
    }

    if (firstSegment === "apps" || firstSegment === "packages" || firstSegment === "agents") {
      services.add(segments[1] ?? firstSegment);
      continue;
    }

    if (firstSegment === "services" && segments[1]) {
      services.add(segments[1]);
      continue;
    }

    services.add(firstSegment);
  }

  return [...services];
}

function inferChangeTypes(changedFiles: string[], diffText: string) {
  const changeTypes = new Set<ChangeSurface["changeTypes"][number]>();
  const lower = `${changedFiles.join("\n")}\n${diffText}`.toLowerCase();

  if (/timeout|abortsignal|deadline/.test(lower)) {
    changeTypes.add("timeout-logic");
  }
  if (/retry|backoff/.test(lower)) {
    changeTypes.add("retry-logic");
  }
  if (/fetch|axios|http|grpc|request|webhook/.test(lower)) {
    changeTypes.add("network-calls");
  }
  if (/sql|query|database|postgres|supabase|prisma/.test(lower)) {
    changeTypes.add("database-queries");
  }
  if (/auth|oauth|token|session/.test(lower)) {
    changeTypes.add("auth");
  }
  if (/payment|billing|checkout/.test(lower)) {
    changeTypes.add("payment");
  }
  if (/queue|job|worker|bull/.test(lower)) {
    changeTypes.add("queue");
  }
  if (/cache|redis|memo/.test(lower)) {
    changeTypes.add("cache");
  }

  if (changeTypes.size === 0) {
    changeTypes.add("other");
  }

  return [...changeTypes];
}

function scoreRiskLevel(linesAdded: number, linesRemoved: number, serviceCount: number, changeTypeCount: number) {
  const size = linesAdded + linesRemoved;

  if (size > 500 || serviceCount > 4 || changeTypeCount > 5) {
    return "critical" as const;
  }
  if (size > 250 || serviceCount > 2 || changeTypeCount > 3) {
    return "high" as const;
  }
  if (size > 80 || serviceCount > 1 || changeTypeCount > 1) {
    return "medium" as const;
  }
  return "low" as const;
}

function summarizeChangeSurface(input: {
  changedServices: string[];
  changedFiles: string[];
  changeTypes: ChangeSurface["changeTypes"];
  riskLevel: ChangeSurface["riskLevel"];
}) {
  return `Changed ${input.changedFiles.length} file(s) across ${input.changedServices.length} service(s); ` +
    `target areas: ${input.changeTypes.join(", ")}; estimated risk ${input.riskLevel}.`;
}

export async function readMrDiff(client: GitLabClient, projectId: number, mrId: number) {
  return fetchMergeRequestChanges(client, projectId, mrId);
}

export function identifyChangedServices(changedFiles: string[]) {
  return extractServicesFromFiles(changedFiles);
}

export function extractChangeSurface(args: {
  mrId: number;
  projectId: number;
  changes: Array<{ new_path: string; diff: string }>;
}) {
  const changedFiles = args.changes.map((change) => change.new_path);
  const diffText = args.changes.map((change) => change.diff).join("\n");
  const changedServices = identifyChangedServices(changedFiles);
  const changeTypes = inferChangeTypes(changedFiles, diffText);
  const linesAdded = args.changes.reduce((sum, change) => sum + change.diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length, 0);
  const linesRemoved = args.changes.reduce((sum, change) => sum + change.diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length, 0);
  const riskLevel = scoreRiskLevel(linesAdded, linesRemoved, changedServices.length, changeTypes.length);

  return changeSurfaceSchema.parse({
    mrId: args.mrId,
    projectId: args.projectId,
    changedFiles,
    changedServices,
    changeTypes,
    riskLevel,
    linesAdded,
    linesRemoved,
    summary: summarizeChangeSurface({
      changedServices,
      changedFiles,
      changeTypes,
      riskLevel,
    }),
  });
}

export async function postMrNote(client: GitLabClient, projectId: number, mrId: number, body: string) {
  return postMergeRequestComment(client, projectId, mrId, body);
}

export async function saveChangeSurface(input: {
  gitlabProjectId: number;
  projectName: string;
  projectNamespace: string;
  mrId: number;
  title: string;
  author: string;
  sourceBranch: string;
  changeSurface: ChangeSurface;
}) {
  const projectUuid = await ensureProject({
    gitlabProjectId: input.gitlabProjectId,
    name: input.projectName,
    namespace: input.projectNamespace,
  });

  const mrUuid = await ensureMergeRequestRecord({
    projectUuid,
    mrId: input.mrId,
    title: input.title,
    author: input.author,
    sourceBranch: input.sourceBranch,
    changeSurface: input.changeSurface,
    status: "analyzed",
  });

  return {
    projectUuid,
    mrUuid,
  };
}

export async function queryResilienceHistory(gitlabProjectId: number, changedServices: string[]) {
  const result = await query<{
    overall: number;
    recommendation: string;
    change_surface: ChangeSurface | null;
    created_at: string;
  }>(
    `SELECT rs.overall, rs.recommendation, mr.change_surface, rs.created_at
     FROM resilience_scores rs
     JOIN merge_requests mr ON mr.id = rs.mr_id
     JOIN projects p ON p.id = mr.project_id
     WHERE p.gitlab_project_id = $1
     ORDER BY rs.created_at DESC
     LIMIT 10`,
    [gitlabProjectId],
  );

  const filtered = result.rows.filter((row) => {
    const surface = row.change_surface as ChangeSurface | null;
    if (!surface) {
      return false;
    }
    return surface.changedServices.some((service) => changedServices.includes(service));
  });

  if (filtered.length === 0) {
    return "No prior resilience history found for these services.";
  }

  return filtered
    .map(
      (row) =>
        `${row.created_at}: score ${row.overall}/100 (${row.recommendation}) for services ${((row.change_surface as ChangeSurface).changedServices).join(", ")}`,
    )
    .join("\n");
}

export async function storeHypotheses(input: {
  gitlabProjectId: number;
  projectName: string;
  projectNamespace: string;
  mrId: number;
  title: string;
  author: string;
  sourceBranch: string;
  hypotheses: Hypothesis[];
  claudeRaw: unknown;
  geminiRaw: unknown;
  consensusRaw: unknown;
}) {
  const parsedHypotheses = hypothesisListSchema.parse(input.hypotheses);
  const projectUuid = await ensureProject({
    gitlabProjectId: input.gitlabProjectId,
    name: input.projectName,
    namespace: input.projectNamespace,
  });
  const mrUuid = await ensureMergeRequestRecord({
    projectUuid,
    mrId: input.mrId,
    title: input.title,
    author: input.author,
    sourceBranch: input.sourceBranch,
    status: "hypotheses-generated",
  });

  const hypothesisBatchId = randomUUID();

  await query(
    `INSERT INTO hypotheses (id, mr_id, data, claude_raw, gemini_raw, consensus_raw)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)`,
    [
      hypothesisBatchId,
      mrUuid,
      JSON.stringify(parsedHypotheses),
      JSON.stringify(input.claudeRaw),
      JSON.stringify(input.geminiRaw),
      JSON.stringify(input.consensusRaw),
    ],
  );

  return {
    projectUuid,
    mrUuid,
    hypothesisBatchId,
  };
}

export async function storeExperimentResults(hypothesisBatchId: string, results: ExperimentResult[]) {
  const parsedResults = experimentResultListSchema.parse(results);

  for (const result of parsedResults) {
    await query(
      `INSERT INTO experiment_results (id, hypothesis_id, passed, failure_detected, failure_description, metrics, logs, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        randomUUID(),
        hypothesisBatchId,
        result.passed,
        result.failureDetected,
        result.failureDescription ?? null,
        JSON.stringify(result.metrics),
        result.logs,
        result.durationSeconds,
      ],
    );
  }
}

export async function storeResilienceScore(input: {
  gitlabProjectId: number;
  mrId: number;
  score: ResilienceScore;
  claudeAnalysis: string;
  fixMrUrl?: string;
}) {
  const parsedScore = resilienceScoreSchema.parse(input.score);
  const mrResult = await query<{ id: string }>(
    `SELECT mr.id
     FROM merge_requests mr
     JOIN projects p ON p.id = mr.project_id
     WHERE p.gitlab_project_id = $1 AND mr.gitlab_mr_id = $2`,
    [input.gitlabProjectId, input.mrId],
  );

  if ((mrResult.rowCount ?? 0) === 0) {
    throw new Error(`Merge request ${input.mrId} for project ${input.gitlabProjectId} was not found in the database.`);
  }

  const mergeRequest = mrResult.rows[0];
  if (!mergeRequest) {
    throw new Error("Merge request score insert lookup returned no rows.");
  }

  await query(
    `INSERT INTO resilience_scores (id, mr_id, overall, breakdown, passed, failed, critical_failures, deployment_allowed, recommendation, claude_analysis, fix_mr_url)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
    [
      randomUUID(),
      mergeRequest.id,
      parsedScore.overall,
      JSON.stringify(parsedScore.breakdown),
      parsedScore.passed,
      parsedScore.failed,
      parsedScore.criticalFailures,
      parsedScore.deploymentAllowed,
      parsedScore.recommendation,
      input.claudeAnalysis,
      input.fixMrUrl ?? null,
    ],
  );
}

export async function updateFixMrUrl(gitlabProjectId: number, mrId: number, fixMrUrl: string) {
  await query(
    `UPDATE resilience_scores rs
     SET fix_mr_url = $1
     FROM merge_requests mr
     JOIN projects p ON p.id = mr.project_id
     WHERE rs.mr_id = mr.id
       AND p.gitlab_project_id = $2
       AND mr.gitlab_mr_id = $3`,
    [fixMrUrl, gitlabProjectId, mrId],
  );
}

export async function fetchLatestScore(gitlabProjectId: number, mrId: number) {
  const result = await query<{
    overall: number;
    breakdown: ResilienceScore["breakdown"];
    passed: number;
    failed: number;
    critical_failures: string[];
    deployment_allowed: boolean;
    recommendation: ResilienceScore["recommendation"];
    claude_analysis: string | null;
    fix_mr_url: string | null;
    created_at: string;
  }>(
    `SELECT rs.overall,
            rs.breakdown,
            rs.passed,
            rs.failed,
            rs.critical_failures,
            rs.deployment_allowed,
            rs.recommendation,
            rs.claude_analysis,
            rs.fix_mr_url,
            rs.created_at
     FROM resilience_scores rs
     JOIN merge_requests mr ON mr.id = rs.mr_id
     JOIN projects p ON p.id = mr.project_id
     WHERE p.gitlab_project_id = $1 AND mr.gitlab_mr_id = $2
     ORDER BY rs.created_at DESC
     LIMIT 1`,
    [gitlabProjectId, mrId],
  );

  return result.rows[0] ?? null;
}

export async function listProjectsOverview() {
  const result = await query<{
    gitlab_project_id: number;
    name: string;
    namespace: string;
    latest_score: number | null;
  }>(
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

export async function getProjectDashboardData(gitlabProjectId: number) {
  const projectResult = await query<{ id: string; name: string; namespace: string }>(
    "SELECT id, name, namespace FROM projects WHERE gitlab_project_id = $1",
    [gitlabProjectId],
  );

  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

  const mergeRequests = await query<{
    gitlab_mr_id: number;
    title: string;
    status: string;
    created_at: string;
    change_surface: ChangeSurface | null;
  }>(
    `SELECT gitlab_mr_id, title, status, created_at, change_surface
     FROM merge_requests
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [project.id],
  );

  const scoreTrend = await query<{
    overall: number;
    created_at: string;
  }>(
    `SELECT rs.overall, rs.created_at
     FROM resilience_scores rs
     JOIN merge_requests mr ON mr.id = rs.mr_id
     WHERE mr.project_id = $1
     ORDER BY rs.created_at DESC
     LIMIT 30`,
    [project.id],
  );

  const experiments = await query<{
    passed: boolean;
    duration_seconds: number;
    created_at: string;
    failure_description: string | null;
  }>(
    `SELECT er.passed, er.duration_seconds, er.created_at, er.failure_description
     FROM experiment_results er
     JOIN hypotheses h ON h.id = er.hypothesis_id
     JOIN merge_requests mr ON mr.id = h.mr_id
     WHERE mr.project_id = $1
     ORDER BY er.created_at DESC
     LIMIT 20`,
    [project.id],
  );

  return {
    project,
    mergeRequests: mergeRequests.rows,
    scoreTrend: scoreTrend.rows,
    experiments: experiments.rows,
  };
}

export async function getMergeRequestDetail(gitlabProjectId: number, mrId: number) {
  const result = await query<{
    title: string;
    author: string;
    source_branch: string;
    status: string;
    change_surface: ChangeSurface | null;
    score_overall: number | null;
    score_breakdown: ResilienceScore["breakdown"] | null;
    score_passed: number | null;
    score_failed: number | null;
    deployment_allowed: boolean | null;
    recommendation: ResilienceScore["recommendation"] | null;
    claude_analysis: string | null;
    fix_mr_url: string | null;
  }>(
    `SELECT mr.title,
            mr.author,
            mr.source_branch,
            mr.status,
            mr.change_surface,
            rs.overall AS score_overall,
            rs.breakdown AS score_breakdown,
            rs.passed AS score_passed,
            rs.failed AS score_failed,
            rs.deployment_allowed,
            rs.recommendation,
            rs.claude_analysis,
            rs.fix_mr_url
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
    [gitlabProjectId, mrId],
  );

  const detail = result.rows[0];
  if (!detail) {
    return null;
  }

  const experimentRows = await query<{
    passed: boolean;
    failure_detected: boolean;
    failure_description: string | null;
    metrics: ExperimentResult["metrics"];
    logs: string;
    duration_seconds: number;
    data: Hypothesis[];
  }>(
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
    [gitlabProjectId, mrId],
  );

  return {
    ...detail,
    experiments: experimentRows.rows,
  };
}

export const toolDefinitions = [
  "read_mr_diff",
  "identify_changed_services",
  "extract_change_surface",
  "post_mr_comment",
  "query_resilience_history",
  "post_experiment_plan_comment",
  "store_hypotheses",
  "read_gcloud_metrics",
  "compute_resilience_score",
  "store_results",
  "post_results_comment",
  "read_source_file",
  "apply_code_patch",
  "create_branch",
  "open_draft_mr",
  "fetch_latest_score",
  "block_deployment",
  "allow_deployment",
  "post_deployment_status",
] as const;
