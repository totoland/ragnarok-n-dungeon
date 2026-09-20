#!/usr/bin/env node
// Assembles www/ — the web folder the native app ships inside its bundle.
//
// The site has no build step: nginx serves the working tree as it stands, and that is still
// true for lab and prod (see the Dockerfile, which copies the same list). A native app cannot
// do that, because the bundle has to contain exactly the files and nothing else: no tests, no
// deploy scripts, no node_modules. So this script copies that same list into www/ and makes
// the three changes a native build needs.
//
//   1. No service worker and no web manifest. Inside the app every file is already local;
//      a worker would only add a second, staler copy of the game. src/install.js sees the
//      native bridge and skips registering it (there is nothing to register here anyway).
//   2. The build id is stamped, the way deploy.sh stamps it for the web, so a telemetry
//      report from a device says which build it came from.
//   3. An absolute telemetry endpoint, if one is configured. The app is not served from a
//      server, so a report to /__log would go nowhere; with DRO_LOG_ENDPOINT (or LAB_PUBLIC
//      from the untracked deploy/.deployrc) the reports reach lab instead, which is the only
//      way to read what a controller did on a device that is not plugged into anything.
//      www/ is gitignored, so the hostname never lands in the repo.
//
// Usage:  node tools/build-web.mjs [outDir]      (default www)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'www');

// The same list the Dockerfile copies, minus the two files that only mean something on the
// web. Keep the two in step: a file missing here 404s in the app exactly as it would there.
const FILES = ['index.html', 'style.css', 'gamepad.html'];
const DIRS = ['src', 'vendor', 'assets'];

function buildId() {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim() ? '-dirty' : '';
    return `ios-${sha}${dirty}`;
  } catch { return `ios-${new Date().toISOString().slice(0, 10)}`; }
}

// Where telemetry should report to. An explicit env var wins; otherwise the lab hostname out
// of the untracked deploy config, so a device build reports to the same place the browser does.
function logEndpoint() {
  if (process.env.DRO_LOG_ENDPOINT !== undefined) return process.env.DRO_LOG_ENDPOINT.trim();
  try {
    const rc = fs.readFileSync(path.join(root, 'deploy', '.deployrc'), 'utf8');
    const hit = rc.match(/^\s*LAB_PUBLIC\s*=\s*["']?([^"'\s#]+)/m);
    if (hit) return hit[1].replace(/\/+$/, '');
  } catch { /* no deploy config on this machine: reports stay off */ }
  return '';
}

const id = buildId();
const endpoint = logEndpoint();

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of DIRS) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace('__BUILD__', id);
// The manifest describes an installable web app; inside a signed bundle it describes nothing.
html = html.replace(/^.*<link rel="manifest".*$\n?/m, '');
if (endpoint) {
  html = html.replace(/(<meta name="build"[^>]*>)/, `$1\n  <meta name="log-endpoint" content="${endpoint}">`);
}
fs.writeFileSync(path.join(out, 'index.html'), html);

const count = (p) => fs.readdirSync(p, { recursive: true }).filter((f) => !fs.statSync(path.join(p, f)).isDirectory()).length;
console.log(`www: ${count(out)} files, build ${id}`);
console.log(endpoint ? `telemetry: reports go to ${endpoint}/__log` : 'telemetry: off (no DRO_LOG_ENDPOINT and no LAB_PUBLIC in deploy/.deployrc)');
