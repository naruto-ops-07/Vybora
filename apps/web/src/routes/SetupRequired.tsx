import { LogoMark } from '@/components/ui/Logo';

/** Shown when required public configuration is missing — fails loudly, never silently. */
export function SetupRequired({ problems }: { problems: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <LogoMark size={44} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Configuration required</h1>
      <p className="mt-2 text-muted">
        VYBORA can’t start because its Supabase configuration is missing or invalid. Copy{' '}
        <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code> and fill in your
        project values.
      </p>
      <ul className="mt-6 space-y-2 rounded-lg border border-line bg-surface p-4 font-mono text-sm">
        {problems.map((p) => (
          <li key={p} className="text-danger">
            {p}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">See README → “Environment configuration”.</p>
    </main>
  );
}
