import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture all
  // transactions for performance monitoring.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Set `environment` to attach meaningful information
  // about which release you're using
  environment: process.env.NODE_ENV,

  // Enable debug mode in development
  debug: process.env.NODE_ENV !== "production",

  // Enable profiling in production
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
});
