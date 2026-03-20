export function FixMRButton({ href }: { href?: string | null }) {
  if (!href) {
    return (
      <div className="panel p-6 text-sm text-ink/65">
        No automated fix MR has been generated for this run.
      </div>
    );
  }

  return (
    <a
      className="panel inline-flex items-center gap-2 px-5 py-4 text-sm font-semibold text-teal transition hover:-translate-y-0.5"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      Open Auto-Generated Fix MR
    </a>
  );
}
