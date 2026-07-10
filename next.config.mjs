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
};
export default nextConfig;
