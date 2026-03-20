# Vorth

Vorth is an intelligent chaos engineering agent for GitLab merge requests. It reads each MR diff, generates targeted chaos experiments with Claude and Gemini, executes them in staging, scores resilience, opens fix MRs for failures, and gates deployment with that score.

## Architecture

Text diagram:

1. GitLab sends MR and note webhooks to `apps/webhook-server`.
2. The diff analyzer reads the MR diff, identifies changed services, and stores a `ChangeSurface`.
3. The hypothesis engine queries resilience history, asks Claude and Gemini for experiments, builds consensus, stores raw outputs, and comments the plan back to the MR.
4. The chaos runner provisions an ephemeral GKE namespace, deploys the changed services, runs chaos experiments, captures metrics/logs, and tears the namespace down.
5. The results analyzer computes the resilience score, asks Claude for a narrative and code-level recommendations, stores the score, and comments the report.
6. The fix writer turns failed experiments into targeted unified diff patches, commits them on a Vorth branch, and opens a draft fix MR.
7. The deploy gate CLI reads the latest stored score and blocks or allows production deployment in GitLab CI.
8. The Next.js dashboard shows project-level and MR-level resilience state from PostgreSQL.

## Prerequisites

- GitLab account with OAuth app credentials and API token
- Google Cloud project with GKE and Cloud Monitoring access
- Anthropic API key for Claude
- Supabase or another PostgreSQL host for `DATABASE_URL`
- `pnpm`, Node.js 20, and `kubectl`

## Installation

1. Copy `.env.example` to `.env` and fill in GitLab, Anthropic, Google Cloud, and PostgreSQL credentials.
2. Install dependencies with `pnpm install`.
3. Apply [`packages/mcp-tools/src/schema.sql`](/C:/Users/manoj/Vorth/packages/mcp-tools/src/schema.sql) to your PostgreSQL database.
4. Start the webhook server and dashboard with `pnpm dev`, or run package-specific `pnpm --filter ... dev` commands.
5. Configure GitLab project webhooks to point at `/webhook/gitlab` and GitLab OAuth to use `/auth/callback`.

## Add Vorth To An Existing GitLab Project

1. Deploy this repo or run it on reachable infrastructure.
2. Add the GitLab webhook pointing to `POST /webhook/gitlab` with `X-Gitlab-Token` matching `GITLAB_WEBHOOK_SECRET`.
3. Add the reusable deploy gate to the consumer repo’s `.gitlab-ci.yml` using the commented include block in this repo’s root `.gitlab-ci.yml`.
4. Ensure the consumer project’s staging environment can be cloned into GKE and reached by the chaos runner.

## Using `/vorth run`

When Vorth comments a resilience plan on an MR, reply in the MR thread with `/vorth run`. The webhook server will regenerate the latest plan, provision an isolated namespace, execute the experiments, post the resilience report, and open a draft fix MR if any experiment fails.

Use `/vorth skip` to bypass resilience testing for a merge request. Vorth records the skip in the MR thread, so teams should require a reason in the same discussion for auditability.

## Understanding The Resilience Score

- Start at `100`.
- Deduct `25` for each failed severity-5 experiment.
- Deduct `15` for each failed severity-4 experiment.
- Deduct `8` for each failed severity-3 experiment.
- Deduct `3` for each failed severity-1 or severity-2 experiment.
- Add `5` if every failed experiment recovered in under `30` seconds.

The score also carries a category breakdown for network resilience, dependency resilience, load resilience, and recovery speed. By default, deployment is allowed when the overall score is at least `70`.

## Deploy Gate

The deploy gate is exposed as a standalone CLI:

```bash
npx vorth-gate check --mr-id <iid> --project-id <id>
```

In CI, it fetches the latest stored score for the MR, posts a GitLab status, and exits `0` or `1`. If the score is below `MIN_RESILIENCE_SCORE` and the recommendation is `do-not-deploy`, the job fails and the production pipeline is blocked.

## Contributing

- Keep agent inputs and outputs validated with `zod`.
- Use `pino` for structured logging and `p-retry` for GitLab or cloud API retries.
- Add tests for deterministic logic before expanding orchestration.
- Keep Claude and Gemini calls deterministic with `temperature: 0`.
- Preserve the requested monorepo shape so external GitLab integration docs remain accurate.

## License

MIT
