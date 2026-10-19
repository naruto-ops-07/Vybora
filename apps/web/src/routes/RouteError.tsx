import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { reportError } from '@/lib/monitoring';
import { Ambient } from '@/components/Ambient';

export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    if (!isRouteErrorResponse(error)) reportError(error);
  }, [error]);
  // A failed lazy chunk usually means a new deploy — a reload fixes it.
  const chunkError =
    error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      <Ambient />
      <main
        id="main"
        className="vy-canvas-layer mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center"
      >
        <LogoMark size={48} />
        <h1 className="type-display mt-8 text-4xl sm:text-5xl">
          {chunkError ? 'A new version is available' : 'Something went wrong'}
        </h1>
        <p className="mt-4 max-w-[42ch] text-lg leading-relaxed text-muted">
          {chunkError
            ? 'Reload to get the latest VYBORA.'
            : 'An unexpected error occurred. Our team has been notified if monitoring is enabled.'}
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <ButtonLink to="/" size="lg" variant="outline">
            Go home
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
