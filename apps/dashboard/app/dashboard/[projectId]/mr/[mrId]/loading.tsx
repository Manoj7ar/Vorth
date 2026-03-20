export default function MRLoading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-6 py-12">
      <div className="flex flex-col justify-between gap-6 md:flex-row">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-sand" />
          <div className="h-10 w-96 rounded-2xl bg-sand" />
          <div className="h-4 w-80 rounded-full bg-sand" />
        </div>
        <div className="h-48 w-48 rounded-full bg-sand" />
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel h-64 bg-white/40" />
        <div className="space-y-6">
          <div className="panel h-28 bg-white/40" />
          <div className="panel h-16 bg-white/40" />
          <div className="panel h-28 bg-white/40" />
        </div>
      </div>
    </main>
  );
}
