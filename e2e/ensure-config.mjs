// Creates amplify_outputs.json from amplify_outputs.example.json when it is
// missing, so `expo export` can run in a fresh checkout or CI. An existing
// file is never touched — a real config always wins.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'amplify_outputs.json');

if (existsSync(target)) {
  console.log('[e2e] amplify_outputs.json present — leaving it alone.');
} else {
  copyFileSync(resolve(root, 'amplify_outputs.example.json'), target);
  console.log('[e2e] amplify_outputs.json missing — wrote placeholder from amplify_outputs.example.json.');
}
