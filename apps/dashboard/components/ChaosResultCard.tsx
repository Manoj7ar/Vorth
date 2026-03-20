interface ChaosResultCardProps {
  title: string;
  description: string;
  recommendation: string;
}

export function ChaosResultCard({ title, description, recommendation }: ChaosResultCardProps) {
  return (
    <article className="panel border-coral/20 p-6">
      <div className="text-xs uppercase tracking-[0.25em] text-coral">Failure Detected</div>
      <h3 className="mt-2 font-display text-2xl">{title}</h3>
      <p className="mt-3 text-sm text-ink/75">{description}</p>
      <div className="mt-4 rounded-2xl bg-sand/70 p-4 text-sm text-ink/80">{recommendation}</div>
    </article>
  );
}
