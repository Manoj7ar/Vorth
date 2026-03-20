import "dotenv-safe/config.js";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  console.log("Seeding Vorth demo data...");

  // Upsert project
  await pool.query(
    `INSERT INTO projects (id, gitlab_project_id, name, namespace)
     VALUES ($1, 1, 'payment-service', 'mygroup/payment-service')
     ON CONFLICT (gitlab_project_id) DO UPDATE SET name = EXCLUDED.name`,
    [randomUUID()],
  );

  const projectResult = await pool.query<{ id: string }>(
    "SELECT id FROM projects WHERE gitlab_project_id = 1",
  );
  const projectUuid = projectResult.rows[0]?.id;
  if (!projectUuid) throw new Error("Project seed failed");

  // Delete existing MR 42 if present (idempotent reseed)
  const existingMr = await pool.query<{ id: string }>(
    "SELECT id FROM merge_requests WHERE project_id = $1 AND gitlab_mr_id = 42",
    [projectUuid],
  );
  if (existingMr.rows[0]) {
    await pool.query("DELETE FROM resilience_scores WHERE mr_id = $1", [existingMr.rows[0].id]);
    await pool.query(
      "DELETE FROM experiment_results WHERE hypothesis_id IN (SELECT id FROM hypotheses WHERE mr_id = $1)",
      [existingMr.rows[0].id],
    );
    await pool.query("DELETE FROM hypotheses WHERE mr_id = $1", [existingMr.rows[0].id]);
    await pool.query("DELETE FROM merge_requests WHERE id = $1", [existingMr.rows[0].id]);
  }

  const mrUuid = randomUUID();
  await pool.query(
    `INSERT INTO merge_requests (id, project_id, gitlab_mr_id, title, author, source_branch, status)
     VALUES ($1, $2, 42, 'Improve payment gateway timeout handling', 'testuser', 'feature/timeout-fix', 'scored')`,
    [mrUuid, projectUuid],
  );

  const hypotheses = [
    { id: "h1", experimentType: "latency-injection", targetService: "payment-gateway", severity: 4, description: "Inject 500ms latency into payment gateway calls to test timeout handling", expectedFailureMode: "request pile-up", passCriteria: "error rate < 5%", failCriteria: "error rate > 20%", estimatedDurationSeconds: 90, claudeConfidence: 0.92, geminiConfidence: 0.88, consensusScore: 0.90 },
    { id: "h2", experimentType: "network-partition", targetService: "payment-gateway", severity: 3, description: "Partition payment gateway from Redis cache", expectedFailureMode: "cache miss cascade", passCriteria: "graceful fallback to DB", failCriteria: "total service failure", estimatedDurationSeconds: 60, claudeConfidence: 0.85, geminiConfidence: 0.82, consensusScore: 0.84 },
    { id: "h3", experimentType: "dependency-failure", targetService: "stripe-client", severity: 5, description: "Kill Stripe client dependency to test circuit breaker", expectedFailureMode: "payment failures", passCriteria: "circuit opens within 5s", failCriteria: "cascading timeouts", estimatedDurationSeconds: 120, claudeConfidence: 0.91, geminiConfidence: 0.0, consensusScore: 0.91 },
    { id: "h4", experimentType: "cpu-stress", targetService: "payment-gateway", severity: 2, description: "Stress CPU to test degraded performance", expectedFailureMode: "increased latency", passCriteria: "p99 < 500ms", failCriteria: "service unresponsive", estimatedDurationSeconds: 45, claudeConfidence: 0.78, geminiConfidence: 0.75, consensusScore: 0.77 },
  ];

  const hypothesisUuid = randomUUID();
  await pool.query(
    `INSERT INTO hypotheses (id, mr_id, data, claude_raw, gemini_raw, consensus_raw)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $3::jsonb)`,
    [
      hypothesisUuid, mrUuid,
      JSON.stringify(hypotheses),
      JSON.stringify(hypotheses.slice(0, 3)),
      JSON.stringify(hypotheses.filter((h) => h.geminiConfidence > 0)),
    ],
  );

  const experiments = [
    {
      hypothesisRef: "h1",
      passed: false,
      failureDetected: true,
      failureDescription: "Error rate spiked to 94% under 500ms gateway delay. No circuit breaker or timeout handler found in payment-gateway/src/client.ts. Requests pile up and exhaust the connection pool.",
      metrics: { p50LatencyMs: 520, p99LatencyMs: 2100, errorRate: 0.94, cpuUsage: 45, memoryUsage: 310, recoveryTimeSeconds: 67 },
      durationSeconds: 92,
    },
    {
      hypothesisRef: "h2",
      passed: true,
      failureDetected: false,
      failureDescription: null,
      metrics: { p50LatencyMs: 12, p99LatencyMs: 89, errorRate: 0.02, cpuUsage: 22, memoryUsage: 280, recoveryTimeSeconds: 8 },
      durationSeconds: 61,
    },
    {
      hypothesisRef: "h3",
      passed: true,
      failureDetected: false,
      failureDescription: null,
      metrics: { p50LatencyMs: 15, p99LatencyMs: 95, errorRate: 0.01, cpuUsage: 18, memoryUsage: 260, recoveryTimeSeconds: 6 },
      durationSeconds: 118,
    },
    {
      hypothesisRef: "h4",
      passed: true,
      failureDetected: false,
      failureDescription: null,
      metrics: { p50LatencyMs: 18, p99LatencyMs: 110, errorRate: 0.03, cpuUsage: 88, memoryUsage: 295, recoveryTimeSeconds: 12 },
      durationSeconds: 46,
    },
  ];

  for (const exp of experiments) {
    await pool.query(
      `INSERT INTO experiment_results (id, hypothesis_id, passed, failure_detected, failure_description, metrics, logs, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        randomUUID(), hypothesisUuid, exp.passed, exp.failureDetected,
        exp.failureDescription,
        JSON.stringify(exp.metrics),
        exp.passed ? "" : "ERROR: connection pool exhausted\nERROR: timeout after 30000ms\nERROR: 47 requests failed",
        exp.durationSeconds,
      ],
    );
  }

  await pool.query(
    `INSERT INTO resilience_scores (id, mr_id, overall, breakdown, passed, failed, critical_failures, deployment_allowed, recommendation, claude_analysis, fix_mr_url)
     VALUES ($1, $2, 43, $3::jsonb, 3, 1, $4, false, 'do-not-deploy', $5, $6)`,
    [
      randomUUID(), mrUuid,
      JSON.stringify({
        networkResilience: 25,
        dependencyResilience: 100,
        loadResilience: 100,
        recoverySpeed: 40,
      }),
      JSON.stringify([
        "payment-gateway: Error rate 94% under 500ms latency. No circuit breaker found in payment-gateway/src/client.ts.",
      ]),
      `The payment service has a critical resilience gap: the gateway client has no circuit breaker and no request timeout. Under simulated 500ms network latency  a realistic production scenario during downstream incidents  error rates hit 94% and the service took 67 seconds to recover after load was removed. The other three experiments passed cleanly.

The fix is straightforward: wrap the gateway client in an opossum circuit breaker with a 5s timeout, 50% error threshold, and 30s reset window. The auto-generated fix MR implements this pattern.

After applying the fix MR and re-running experiments, the projected score is 89/100  above the deployment threshold.`,
      "https://gitlab.com/mygroup/payment-service/-/merge_requests/43",
    ],
  );

  console.log(`
 Seed complete!

Demo data created:
  Project:  payment-service (gitlab_project_id = 1)
  MR:       !42 "Improve payment gateway timeout handling"
  Score:    43/100  DEPLOY BLOCKED
  Fix MR:   https://gitlab.com/mygroup/payment-service/-/merge_requests/43

Visit: http://localhost:3000/dashboard/1/mr/42
  `);

  await pool.end();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
