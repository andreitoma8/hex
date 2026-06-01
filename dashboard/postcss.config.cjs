const path = require('path');

// `next build dashboard` runs from the package root, so Tailwind's auto-discovery
// looks for tailwind.config.* in the wrong place and silently falls back to a
// default config with no content paths. Pointing at the dashboard's config
// explicitly makes the utility classes get scanned + emitted.
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.ts') },
    autoprefixer: {},
  },
};
