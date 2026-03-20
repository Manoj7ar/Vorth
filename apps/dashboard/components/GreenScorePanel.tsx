interface GreenScorePanelProps {
  experimentsRun: number;
  failuresCaught: number;
  deploymentBlocked: boolean;
}

function calculateGreenMetrics(experimentsRun: number, failuresCaught: number, deploymentBlocked: boolean) {
  // Assumptions (conservative, sourced from cloud carbon benchmarks):
  // - Each wasted production rollback: ~2.4 kWh (GCP e2-standard-4, ~20 min incident)
  // - Grid carbon intensity average: 0.233 kg CO / kWh (IEA global average 2024)
  // - Each Vorth staging experiment: ~0.08 kWh (ephemeral namespace, 2 min max)
  const rollbacksAvoided = deploymentBlocked ? 1 : 0;
  const productionIncidentKwh = rollbacksAvoided * 2.4;
  const stagingKwh = experimentsRun * 0.08;
  const netKwhSaved = productionIncidentKwh - stagingKwh;
  const co2SavedKg = Math.max(0, netKwhSaved * 0.233);
  const co2StagingKg = stagingKwh * 0.233;
  const efficiencyPct = experimentsRun > 0 && failuresCaught > 0 ? Math.round((failuresCaught / experimentsRun) * 100) : 0;

  return {
    co2SavedKg: co2SavedKg.toFixed(3),
    co2StagingKg: co2StagingKg.toFixed(3),
    netKwhSaved: netKwhSaved.toFixed(2),
    rollbacksAvoided,
    efficiencyPct,
  };
}

export function GreenScorePanel({ experimentsRun, failuresCaught, deploymentBlocked }: GreenScorePanelProps) {
  const metrics = calculateGreenMetrics(experimentsRun, failuresCaught, deploymentBlocked);

  return (
    <div className="panel border-teal/20 p-6">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌱</span>
        <div className="text-xs uppercase tracking-[0.25em] text-teal">Green Impact</div>
      </div>
      <div className="mt-3 font-display text-3xl text-teal">
        {metrics.co2SavedKg} kg CO₂
      </div>
      <div className="mt-1 text-xs text-ink/55">estimated net carbon saved</div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/65">Rollbacks avoided</span>
          <span className="font-semibold">{metrics.rollbacksAvoided}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/65">Staging cost</span>
          <span className="font-semibold">{metrics.co2StagingKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/65">Net energy saved</span>
          <span className="font-semibold">{metrics.netKwhSaved} kWh</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/65">Failure detection rate</span>
          <span className="font-semibold">{metrics.efficiencyPct}%</span>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink/50">
        Vorth catches failures in ephemeral staging, not in production. Fewer bad deploys means fewer rollbacks,
        less wasted compute, and lower carbon. Staging costs ~{metrics.co2StagingKg} kg CO₂; avoiding one
        production incident saves ~{(0.233 * 2.4).toFixed(3)} kg.
      </p>
    </div>
  );
}
