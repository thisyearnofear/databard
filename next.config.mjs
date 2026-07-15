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
  // Exclude heavy non-runtime directories from file tracing
  outputFileTracingExcludes: {
    "/": [
      "./contracts/**/*",
      "./video/**/*",
      "./docs/**/*",
      "./blog/**/*",
      "./tests/**/*",
      "./playwright-report/**/*",
      "./scripts/**/*",
      ".next/standalone/**/*",
    ],
  },
};
export default nextConfig;
