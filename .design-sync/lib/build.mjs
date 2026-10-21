#!/usr/bin/env node
// Builds the design-sync library entry (./index.ts) into dist/:
//   dist/index.js     ESM, react-native -> react-native-web, every dep inlined;
//                     react / react-dom resolve to the window globals the
//                     converter vendors (its own reactShim)
//   dist/types/...    .d.ts tree from tsc, the converter's API contract
//
// Mirrors the Metro web config in ../../metro.config.js: the Stripe web shim,
// the crypto alias, and .web.* platform resolution. '@env' is stubbed so the
// developer's .env never reaches the bundle.
//
// Run from the repo root:  node .design-sync/lib/build.mjs
// esbuild comes from the staged converter deps (.ds-sync/node_modules).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const require = createRequire(join(root, '.ds-sync', 'package.json'));
const esbuild = require('esbuild');
// Reuse the converter's shim (react / react-dom / react-is / scheduler ->
// window.React / window.ReactDOM) rather than leaving react external: CommonJS
// deps `require('react')`, which esbuild can't hand to an ESM external - it
// becomes a runtime throw - and one React instance is required anyway.
const { reactShim } = await import(pathToFileURL(join(root, '.ds-sync/lib/bundle.mjs')).href);

// The app's context objects are module-private; SideBetProvider needs them to
// supply sample values. Append an export to each context module as it's
// loaded - the module itself is otherwise bundled exactly as written.
const CONTEXT_RX = /[\\/]src[\\/]contexts[\\/](Auth|Profile|BetData|EventCheckIn|Notification)Context\.tsx$/;
const contextExports = {
  name: 'context-exports',
  setup(b) {
    b.onLoad({ filter: CONTEXT_RX }, (args) => {
      const name = `${CONTEXT_RX.exec(args.path)[1]}Context`;
      return { contents: `${readFileSync(args.path, 'utf8')}\nexport { ${name} };\n`, loader: 'tsx' };
    });
  },
};

rmSync(join(here, 'dist'), { recursive: true, force: true });
mkdirSync(join(here, 'dist'), { recursive: true });

// Canvas Amplify config (SideBetProvider calls Amplify.configure with it).
// Unconfigured, `client.models.X` doesn't exist and some calls throw outside
// the components' try/catch; configured against an unreachable host, they fail
// over the network and land in the catch blocks. ONLY the schema description
// (model_introspection, also derivable from amplify/data/resource.ts) is copied
// from the local amplify_outputs.json - never its url, api_key or auth IDs.
const canvasAmplify = join(here, 'dist', 'canvas-amplify.json');
{
  let modelIntrospection;
  try {
    modelIntrospection = JSON.parse(readFileSync(join(root, 'amplify_outputs.json'), 'utf8')).data?.model_introspection;
  } catch { /* absent - data-bound components will show their thrown/empty states */ }
  if (!modelIntrospection) console.error('[build-lib] no model_introspection in amplify_outputs.json - canvas data client stays unconfigured');
  writeFileSync(canvasAmplify, JSON.stringify(modelIntrospection ? {
    version: '1.4',
    data: {
      url: 'https://sidebet-canvas.invalid/graphql',
      aws_region: 'us-east-1',
      api_key: 'da2-canvas-placeholder',
      default_authorization_type: 'API_KEY',
      authorization_types: [],
      model_introspection: modelIntrospection,
    },
  } : {}));
}

const asset = 'dataurl';
await esbuild.build({
  entryPoints: [join(here, 'index.ts')],
  outfile: join(here, 'dist', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  tsconfig: join(here, 'tsconfig.json'),
  nodePaths: [join(root, 'node_modules')],
  plugins: [reactShim, contextExports],
  alias: {
    'react-native': 'react-native-web',
    '@stripe/stripe-react-native': join(root, 'src/web/stripe-react-native.tsx'),
    crypto: 'react-native-get-random-values',
    '@env': join(here, 'env-stub.ts'),
    'sidebet-canvas-amplify-config': canvasAmplify,
    'node:async_hooks': join(here, 'async-hooks-stub.ts'),
  },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json'],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  loader: {
    '.js': 'jsx',
    '.png': asset, '.jpg': asset, '.jpeg': asset, '.gif': asset, '.webp': asset,
    '.ttf': asset, '.otf': asset,
  },
  define: {
    __DEV__: 'false',
    global: 'globalThis',
    // Fixed env object rather than a `process` shim: libraries (Amplify)
    // sniff `typeof process` to detect Node, which must stay false here.
    'process.env': '{"EXPO_OS":"web","NODE_ENV":"production"}',
    'process.env.EXPO_OS': '"web"',
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'warning',
  legalComments: 'none',
});

// dist/tokens.css: the src/styles tokens as CSS custom properties, so layout
// glue written next to the components (plain HTML/CSS) can stay on-brand.
// Evaluated in node from a throwaway bundle with Platform stubbed to web.
{
  const tmp = join(here, 'dist', '.tokens.mjs');
  await esbuild.build({
    stdin: {
      contents: `export * from ${JSON.stringify(join(root, 'src/styles/index.ts'))};`,
      resolveDir: here,
      loader: 'ts',
    },
    outfile: tmp, bundle: true, format: 'esm', platform: 'node', logLevel: 'warning',
    plugins: [{
      name: 'rn-platform-stub',
      setup(b) {
        b.onResolve({ filter: /^react-native$/ }, () => ({ path: 'rn', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `export const Platform = { OS: 'web', select: (o) => ('web' in o ? o.web : o.default) };
                     export const Dimensions = { get: () => ({ width: 390, height: 844 }) };
                     export const PixelRatio = { get: () => 1, roundToNearestPixel: (n) => n };`,
          loader: 'js',
        }));
      },
    }],
  });
  const t = await import(pathToFileURL(tmp).href);
  rmSync(tmp);
  const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const px = (v) => (typeof v === 'number' ? `${v}px` : v);
  const lines = [];
  const add = (prefix, obj, fmt = (v) => v) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && typeof v !== 'object') lines.push(`  --sb-${prefix}-${kebab(k)}: ${fmt(v)};`);
    }
  };
  add('color', t.colors);
  // Named steps only - the numeric 0..64 scale duplicates them.
  add('space', Object.fromEntries(Object.entries(t.spacing).filter(([k]) => !/^\d+$/.test(k))), px);
  add('radius', t.spacing.radius, px);
  add('font-size', t.typography.fontSize, px);
  add('font-weight', t.typography.fontWeight);
  writeFileSync(join(here, 'dist', 'tokens.css'), [
    '/* SideBet design tokens - generated from src/styles by .design-sync/lib/build.mjs. */',
    ':root {',
    `  --sb-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;`,
    `  --sb-font-family-mono: "Courier New", ui-monospace, monospace;`,
    ...lines,
    '}',
    '',
  ].join('\n'));
}

// Declarations. Type errors are reported but don't stop emit
// (noEmitOnError: false) - the app's own `npm run typecheck` owns them.
try {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(here, 'tsconfig.json')], { stdio: 'inherit' });
} catch {
  console.error('[build-lib] tsc reported errors (declarations still emitted)');
}
console.error('[build-lib] dist/ ready');
