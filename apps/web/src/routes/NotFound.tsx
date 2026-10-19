import { ButtonLink } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { Ambient } from '@/components/Ambient';

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      <Ambient />
      <main
        id="main"
        className="vy-canvas-layer mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center"
      >
        <LogoMark size={48} />
        <p className="mt-8 font-mono text-sm tracking-[0.2em] text-accent">404</p>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">This page isn’t here</h1>
        <p className="mt-4 max-w-[42ch] text-lg leading-relaxed text-muted">
          The link may be broken, or the content may have been removed or made private.
        </p>
        <ButtonLink to="/" size="lg" className="mt-9">
          Back to VYBORA
        </ButtonLink>
      </main>
    </div>
  );
}
