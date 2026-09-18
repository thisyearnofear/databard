import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Reduce parallelism during static generation to stay within memory limits
    workerThreads: false,
    cpus: 1,
  },
  // Only include nodemailer for the route that actually sends emails
  outputFileTracingIncludes: {
    "/api/regenerate": ["./node_modules/nodemailer/**/*"],
    "/api/schedules/run": ["./node_modules/nodemailer/**/*"],
  },
  // Exclude heavy non-runtime directories from file tracing. The "*" key
  // applies to every route: several libs read via path.join(process.cwd(), …),
  // which makes the tracer fall back to including the whole project root —
  // without this, demo screenshots and test artifacts land in the bundle.
  // Keep public/ traced: demo fixtures read episode MP3s from it at runtime,
  // and prepare-standalone.mjs's binary filter strips them from its own copy.
  outputFileTracingExcludes: {
    "*": [
      "./contracts/**/*",
      "./video/**/*",
      "./videos/**/*",
      "./docs/**/*",
      "./blog/**/*",
      "./tests/**/*",
      "./playwright-report/**/*",
      "./test-results/**/*",
      "./scripts/**/*",
      "./demo-assets/**/*",
      "./screenshots-review/**/*",
      "./screenshots-review-v2/**/*",
      "./examples/**/*",
      "./datahub-contribution/**/*",
      "./data/**/*",
      "./.databard/**/*",
      "./tsconfig.tsbuildinfo",
      ".next/standalone/**/*",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
