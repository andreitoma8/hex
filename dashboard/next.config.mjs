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
  webpack(config) {
    // Some externalDir core modules (e.g. src/core/review.ts) use TS-ESM
    // `./sibling.js` import specifiers that resolve to `.ts` on disk. webpack's
    // default resolver can't follow those, so teach it to try `.ts`/`.tsx`
    // before `.js`. The fallback keeps real `.js` deps in node_modules working.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
