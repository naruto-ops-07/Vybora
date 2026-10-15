import type * as SentryNamespace from '@sentry/react';

type SentryModule = typeof SentryNamespace;
let sentry: SentryModule | null = null;

/**
 * Error monitoring is enabled only when VITE_SENTRY_DSN is configured. The
 * SDK is loaded lazily so deployments without monitoring don't pay for it.
 */
export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  void import('@sentry/react').then((mod) => {
    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      // Never send captions, messages or other user content as PII.
      sendDefaultPii: false,
    });
    sentry = mod;
  });
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.error(error, context);
  sentry?.captureException(error, context ? { extra: context } : undefined);
}
