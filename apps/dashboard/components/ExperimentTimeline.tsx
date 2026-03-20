interface ExperimentTimelineItem {
  name: string;
  target: string;
  durationSeconds: number;
  passed: boolean;
  keyMetric: string;
}

export function ExperimentTimeline({ items }: { items: ExperimentTimelineItem[] }) {
  return (
    <div className="panel p-6">
      <h2 className="font-display text-2xl">Experiment Timeline</h2>
      <div className="mt-6 space-y-5 border-l border-ink/15 pl-6">
        {items.map((item) => (
          <div key={`${item.name}-${item.target}`} className="relative">
            <span
              className={`absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-canvas ${item.passed ? "bg-teal" : "bg-coral"}`}
            />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold">{item.name}</div>
                <div className="text-sm text-ink/65">{item.target}</div>
              </div>
              <div className="text-right text-sm text-ink/70">
                <div>{item.durationSeconds}s</div>
                <div>{item.passed ? "Pass" : "Fail"}</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-ink/70">{item.keyMetric}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
