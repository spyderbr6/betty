// Minimal static server for the exported web bundle. Deliberately dependency
// free — the e2e suite should not drag a server package into the app's tree.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
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

createServer((req, res) => {
  const requested = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // normalize() collapses any ../ segments before they are joined to root,
  // so a crafted URL cannot read outside the bundle directory.
  let filePath = join(root, normalize(requested));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // Expo exports a single-page app: unknown paths fall back to index.html.
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}).listen(port, () => console.log(`[e2e] Serving ${root} on http://localhost:${port}`));
