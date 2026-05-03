// Thin logging + error reporting wrapper.
//
// Today this is just console.* with a consistent shape so logs are grep-able.
// The reason it exists as its own module is to give us a single import to
// retrofit when we add Sentry (or another tracker):
//
//   import { reportError } from "@/lib/log";
//   try { ... } catch (e) { reportError(e, { route: "/api/stripe/webhook" }); throw e; }
//
// To add Sentry later:
//   1. `npm i @sentry/nextjs`
//   2. Add SENTRY_DSN to env, init Sentry in `instrumentation.ts`
//   3. Replace the body of reportError() below with `Sentry.captureException(...)`
// No callers need to change.

type LogContext = Record<string, unknown>;

const SERVICE = "cardex-web";

function format(level: string, message: string, ctx?: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    service: SERVICE,
    level,
    message,
    ...ctx,
  };
  return JSON.stringify(payload);
}

export function logInfo(message: string, ctx?: LogContext) {
  console.log(format("info", message, ctx));
}

export function logWarn(message: string, ctx?: LogContext) {
  console.warn(format("warn", message, ctx));
}

export function logError(message: string, ctx?: LogContext) {
  console.error(format("error", message, ctx));
}

/** Capture an exception. Adds context, structures the log line, and (later)
 *  forwards to Sentry. Always re-raise after calling this if the caller
 *  wants the request to fail. */
export function reportError(err: unknown, ctx?: LogContext) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(
    format("error", e.message, {
      ...ctx,
      stack: e.stack,
      name: e.name,
    }),
  );
  // TODO(sentry): Sentry.captureException(e, { extra: ctx });
}
