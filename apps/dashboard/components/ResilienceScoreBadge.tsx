interface ResilienceScoreBadgeProps {
  score: number;
  deploymentAllowed: boolean;
}

function resolveColor(score: number) {
  if (score < 50) {
    return "#e76f51";
  }
  if (score < 70) {
    return "#f4a261";
  }
  return "#0f8b8d";
}

export function ResilienceScoreBadge({ score, deploymentAllowed }: ResilienceScoreBadgeProps) {
  const color = resolveColor(score);
  const ring = `conic-gradient(${color} ${score}%, rgba(31, 42, 36, 0.12) ${score}% 100%)`;

  return (
    <div className="panel flex flex-col items-center gap-3 p-8 text-center">
      <div
        className="grid h-48 w-48 place-items-center rounded-full"
        style={{ background: ring }}
      >
        <div className="grid h-36 w-36 place-items-center rounded-full bg-canvas">
          <div>
            <div className="font-display text-5xl font-semibold">{score}</div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink/60">Resilience</div>
          </div>
        </div>
      </div>
      <div className="text-sm font-semibold uppercase tracking-[0.25em] text-ink/70">
        {deploymentAllowed ? "Deploy Allowed" : "Deploy Blocked"}
      </div>
    </div>
  );
}
