// Minimal static server for the exported web bundle. Deliberately dependency
// free — the e2e suite should not drag a server package into the app's tree.
//
// The bundle is indexed once at startup and requests are answered by looking a
// URL path up in that index. No filesystem path is ever constructed from
// request data: the only paths ever opened are ones discovered by walking
// dist/ ourselves, so path traversal is not merely blocked but unrepresentable.
// (An earlier version built the path with join(root, normalize(url)) and
// checked the result. That held up against traversal probes, but it made
// safety a property of the checks rather than of the structure, and it is the
// shape static analysis flags — correctly, as something a reader cannot audit
// at a glance.)
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.E2E_PORT ?? 8899);

if (!existsSync(root)) {
  console.error(`[e2e] No web bundle at ${root}. Run: npm run build`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

/** URL path -> absolute file path, for every file in the bundle. */
const bundle = new Map();
(function index(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      index(absolutePath);
    } else {
      bundle.set(`/${relative(root, absolutePath).split(sep).join('/')}`, absolutePath);
    }
  }
})(root);

const entryPoint = bundle.get('/index.html');
if (!entryPoint) {
  console.error(`[e2e] No index.html in ${root}. Run: npm run build`);
  process.exit(1);
}

createServer((req, res) => {
  let urlPath = '/';
  try {
    urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    // Malformed percent-encoding (e.g. "/%zz") makes decodeURIComponent throw.
    // Left unhandled this takes the whole process down, so a single bad request
    // would end the test run. Fall through to the entry point instead.
  }

  // Miss means either a genuine 404 or a client-side route; Expo exports a
  // single-page app, so both are answered with the entry point.
  const file = bundle.get(urlPath) ?? entryPoint;

  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
  // Bound to loopback: this serves a local build to a local browser and should
  // never be reachable from off the machine.
}).listen(port, '127.0.0.1', () => console.log(`[e2e] Serving ${root} on http://localhost:${port}`));
