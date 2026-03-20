# Vorth

**Intelligent chaos engineering for GitLab merge requests.** Vorth reads each MR diff, generates targeted chaos experiments using Claude and Gemini, runs them in an isolated GKE staging namespace, scores resilience 0-100, opens fix MRs for failures, and gates production deployment behind the score.

> Built for the GitLab AI Hackathon 2026 - "You Orchestrate. AI Accelerates."

## How It Works

```text
MR opened -> Diff Analyzer -> Hypothesis Engine (Claude + Gemini) -> Chaos Runner (GKE)
                                                                             
  Deploy Gate CLI <- Results Analyzer (Claude) <- Experiment Results + Metrics
                                 
   Block / Allow            Fix Writer (Claude) -> Draft Fix MR
```

1. GitLab sends an MR webhook to Vorth's webhook server.
2. The **Diff Analyzer** reads the diff and extracts changed services and risk level.
3. The **Hypothesis Engine** asks Claude (primary) and Gemini (validator) for targeted chaos experiments, builds consensus, and comments the plan on the MR.
4. The developer replies `/vorth run`.
5. The **Chaos Runner** provisions an ephemeral GKE namespace, deploys the changed services, runs experiments (`latency-injection`, `network-partition`, `cpu-stress`, `memory-stress`, `dependency-failure`), and tears everything down.
6. The **Results Analyzer** computes the resilience score, asks Claude for a code-level narrative, and comments the report.
7. If any experiment fails, the **Fix Writer** uses Claude to generate unified diff patches, commits them on a Vorth branch, and opens a draft fix MR.
8. The **Deploy Gate** CLI reads the score from the database and exits 0 (allow) or 1 (block) inside GitLab CI.
9. The **Next.js dashboard** shows project and MR-level resilience history, the green impact panel, and links to fix MRs.
10. The **MCP server** at `/mcp` exposes Vorth's intelligence to Cursor and other MCP clients.

## Quick Start (local, no GKE required)

```bash
# 1. Clone and install
git clone https://gitlab.com/your-group/vorth && cd vorth
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in: GITLAB_TOKEN, GITLAB_WEBHOOK_SECRET, ANTHROPIC_API_KEY, DATABASE_URL, NEXTAUTH_SECRET
# GKE/Vertex keys can remain as dummy strings for local testing

# 3. Apply database schema
psql $DATABASE_URL < packages/mcp-tools/src/schema.sql

# 4. Seed demo data
npx tsx scripts/seed-demo.ts

# 5. Build and test
pnpm build
pnpm test   # scorer.test.ts and consensus.test.ts must pass

# 6. Start servers (two terminals)
pnpm --filter @vorth/webhook-server dev   # http://localhost:3001
pnpm --filter @vorth/dashboard dev        # http://localhost:3000

# 7. Verify
curl http://localhost:3001/health         # {"ok":true}
open http://localhost:3000/dashboard/1/mr/42  # demo MR
```

## Sending a Test Webhook

```bash
curl -X POST http://localhost:3001/webhook/gitlab \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: $GITLAB_WEBHOOK_SECRET" \
  -d '{
    "object_kind": "merge_request",
    "project": { "id": 1, "name": "payment-service", "path_with_namespace": "mygroup/payment-service" },
    "user": { "name": "Test User", "username": "testuser" },
    "object_attributes": {
      "iid": 1, "title": "Improve payment gateway timeout handling",
      "source_branch": "feature/timeout-fix", "target_branch": "main", "action": "open"
    }
  }'
```

Trigger `/vorth run` by sending the same payload with `"object_kind": "note"` and `"object_attributes": { "note": "/vorth run" }`.

## Deploy Gate in GitLab CI

```yaml
include:
  - project: 'your-group/vorth'
    file: '.gitlab-ci.yml'
    ref: main

vorth-resilience-gate:
  stage: pre-deploy
  script:
    - npx vorth-gate check --mr-id $CI_MERGE_REQUEST_IID --project-id $CI_PROJECT_ID
  rules:
    - if: $CI_MERGE_REQUEST_IID
```

## MCP Integration (Cursor / Claude)

Add to your MCP config or use the provided `vorth-mcp-config.json`:

```json
{
  "mcpServers": {
    "vorth": { "url": "http://localhost:3001/mcp", "transport": "http" }
  }
}
```

Available tools: `get_score_by_mr`, `get_project_overview`, `get_mr_experiments`, `check_deployment_safety`.

## Resilience Score

| Severity | Penalty |
|----------|---------|
| 5 (critical) | 25 |
| 4 (high) | 15 |
| 3 (medium) | 8 |
| 1-2 (low) | 3 |
| All failures recovered < 30s | +5 bonus |

Score >= 70 means deployment allowed. Score < 70 with critical failures means `do-not-deploy`.

## Architecture

```text
apps/
  dashboard/          Next.js 14 app router UI
  webhook-server/     Express, receives GitLab webhooks, exposes MCP
agents/
  diff-analyzer/      Reads MR diffs, extracts change surface
  hypothesis-engine/  Claude + Gemini consensus experiment planning
  chaos-runner/       kubectl experiments in ephemeral GKE namespaces
  results-analyzer/   Claude narrative + resilience scoring
  fix-writer/         Claude unified diff patches + draft fix MR
  deploy-gate/        CLI to block or allow production deployment
packages/
  shared-types/       Zod schemas shared across all agents
  gitlab-client/      GitLab REST API client with retry
  mcp-tools/          Database queries + MCP tool definitions
infra/
  terraform/          GKE cluster, Cloud Monitoring dashboard, GCS bucket
  k8s/                Kubernetes namespace and chaos runner job manifests
```

## License

MIT - see [LICENSE](LICENSE).
