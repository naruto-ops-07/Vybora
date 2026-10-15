import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { reportError } from '@/lib/monitoring';

export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    if (!isRouteErrorResponse(error)) reportError(error);
  }, [error]);
  // A failed lazy chunk usually means a new deploy — a reload fixes it.
  const chunkError =
    error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <LogoMark size={44} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {chunkError ? 'A new version is available' : 'Something went wrong'}
      </h1>
      <p className="mt-2 text-muted">
        {chunkError
          ? 'Reload to get the latest VYBORA.'
          : 'An unexpected error occurred. Our team has been notified if monitoring is enabled.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <ButtonLink to="/" variant="outline">
          Go home
        </ButtonLink>
      </div>
    </main>
  );
}
