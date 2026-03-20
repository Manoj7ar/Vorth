export function DeployGateStatus(props: { deploymentAllowed: boolean; recommendation?: string | null }) {
  return (
    <div className={`panel p-6 ${props.deploymentAllowed ? "border-teal/25" : "border-coral/25"}`}>
      <div className="text-xs uppercase tracking-[0.25em] text-ink/60">Deploy Gate</div>
      <div className="mt-2 font-display text-3xl">
        {props.deploymentAllowed ? "Allowed" : "Blocked"}
      </div>
      <p className="mt-2 text-sm text-ink/70">
        {props.recommendation ? `Recommendation: ${props.recommendation}` : "No recommendation available yet."}
      </p>
    </div>
  );
}
