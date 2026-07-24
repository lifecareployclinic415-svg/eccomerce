//   npm install @sentry/nextjs
//   npx @sentry/wizard@latest -i nextjs
//
// The wizard writes most of this. Verify the generated files against
// current Sentry docs — their Next.js integration changes often enough
// that copied snippets go stale quickly.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const Sentry = await import("@sentry/nextjs");
  // @ts-expect-error — signature varies by Sentry version
  return Sentry.captureRequestError(...args);
};

