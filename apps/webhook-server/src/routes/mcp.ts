import type { Request, Response } from "express";
import { fetchLatestScore, getProjectDashboardData, getMergeRequestDetail } from "@vorth/mcp-tools";
import pino from "pino";

const logger = pino({ name: "vorth-mcp" });

// MCP tool definitions  these are returned to the client on discovery
const TOOLS = [
  {
    name: "get_score_by_mr",
    description: "Get the latest Vorth resilience score for a GitLab merge request. Returns overall score (0-100), breakdown, recommendation, Claude analysis, and fix MR URL.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "number", description: "GitLab project ID (numeric)" },
        mr_id: { type: "number", description: "GitLab merge request IID (the !N number)" },
      },
      required: ["project_id", "mr_id"],
    },
  },
  {
    name: "get_project_overview",
    description: "Get the resilience overview for a GitLab project  recent MRs, score trend, and latest experiments.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "number", description: "GitLab project ID (numeric)" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_mr_experiments",
    description: "Get detailed chaos experiment results for a merge request  each experiment, pass/fail, metrics, and failure description.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "number", description: "GitLab project ID (numeric)" },
        mr_id: { type: "number", description: "GitLab merge request IID" },
      },
      required: ["project_id", "mr_id"],
    },
  },
  {
    name: "check_deployment_safety",
    description: "Check whether Vorth considers a merge request safe to deploy to production. Returns allowed/blocked status, score, and reason.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "number", description: "GitLab project ID (numeric)" },
        mr_id: { type: "number", description: "GitLab merge request IID" },
      },
      required: ["project_id", "mr_id"],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  const projectId = Number(args["project_id"]);
  const mrId = Number(args["mr_id"]);

  switch (name) {
    case "get_score_by_mr": {
      const score = await fetchLatestScore(projectId, mrId);
      if (!score) {
        return { content: [{ type: "text", text: `No resilience score found for project ${projectId} MR !${mrId}. Vorth may not have run yet  open an MR and reply /vorth run.` }] };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            overall: score.overall,
            breakdown: score.breakdown,
            passed: score.passed,
            failed: score.failed,
            critical_failures: score.critical_failures,
            deployment_allowed: score.deployment_allowed,
            recommendation: score.recommendation,
            claude_analysis: score.claude_analysis,
            fix_mr_url: score.fix_mr_url,
            scored_at: score.created_at,
          }, null, 2),
        }],
      };
    }

    case "get_project_overview": {
      const data = await getProjectDashboardData(projectId);
      if (!data) {
        return { content: [{ type: "text", text: `Project ${projectId} not found in Vorth. Make sure the webhook is configured and at least one MR has been analyzed.` }] };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            project: data.project,
            recent_mrs: data.mergeRequests.map((mr) => ({ id: mr.gitlab_mr_id, title: mr.title, status: mr.status })),
            score_trend: data.scoreTrend,
            recent_experiment_count: data.experiments.length,
            recent_failure_count: data.experiments.filter((e) => !e.passed).length,
          }, null, 2),
        }],
      };
    }

    case "get_mr_experiments": {
      const detail = await getMergeRequestDetail(projectId, mrId);
      if (!detail) {
        return { content: [{ type: "text", text: `No experiment data found for project ${projectId} MR !${mrId}.` }] };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            mr_title: detail.title,
            source_branch: detail.source_branch,
            experiments: detail.experiments.map((e) => ({
              passed: e.passed,
              failure_detected: e.failure_detected,
              failure_description: e.failure_description,
              duration_seconds: e.duration_seconds,
              error_rate: e.metrics.errorRate,
              p99_latency_ms: e.metrics.p99LatencyMs,
              recovery_time_seconds: e.metrics.recoveryTimeSeconds,
            })),
          }, null, 2),
        }],
      };
    }

    case "check_deployment_safety": {
      const score = await fetchLatestScore(projectId, mrId);
      if (!score) {
        return {
          content: [{
            type: "text",
            text: `No Vorth score exists for project ${projectId} MR !${mrId}. Deployment status: UNKNOWN. Run /vorth run on the MR to generate a score.`,
          }],
        };
      }
      const minScore = Number(process.env.MIN_RESILIENCE_SCORE ?? "70");
      return {
        content: [{
          type: "text",
          text: `Deployment ${score.deployment_allowed ? "ALLOWED" : "BLOCKED"}.\n\nScore: ${score.overall}/100 (threshold: ${minScore})\nRecommendation: ${score.recommendation}\n\n${score.critical_failures.length > 0 ? `Critical failures:\n${score.critical_failures.map((f) => ` ${f}`).join("\n")}` : "No critical failures."}\n\n${score.fix_mr_url ? `Fix MR: ${score.fix_mr_url}` : ""}`,
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function mcpRoute(request: Request, response: Response) {
  try {
    const body = request.body as { method?: string; params?: Record<string, unknown>; id?: unknown };

    // MCP discovery
    if (body.method === "tools/list") {
      response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: TOOLS },
      });
      return;
    }

    // MCP tool call
    if (body.method === "tools/call") {
      const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      if (!params?.name) {
        response.status(400).json({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "Missing tool name" } });
        return;
      }
      const result = await callTool(params.name, params.arguments ?? {});
      response.json({ jsonrpc: "2.0", id: body.id, result });
      return;
    }

    // MCP initialize handshake
    if (body.method === "initialize") {
      response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "vorth-mcp", version: "0.1.0" },
        },
      });
      return;
    }

    response.status(400).json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    logger.error({ err: error }, "MCP route error");
    response.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" },
    });
  }
}
