import { ButtonLink } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <LogoMark size={44} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">This page isn’t here</h1>
      <p className="mt-2 text-muted">
        The link may be broken, or the content may have been removed or made private.
      </p>
      <ButtonLink to="/" className="mt-6">
        Back to VYBORA
      </ButtonLink>
    </main>
  );
}
