/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['chokidar'],
    // Allow importing the canonical issue-mutation module from ../src/core/
    // (shared with the `hex issue` CLI). The module depends only on node
    // builtins, so nothing heavy leaks into the bundle.
    externalDir: true,
  },
};

export default nextConfig;
