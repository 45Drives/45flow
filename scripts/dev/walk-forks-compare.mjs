#!/usr/bin/env node
// End-to-end walk of linked forks and version compare (LF5), against the local
// dev environment started by scripts/dev/dev.sh.
//
//   node scripts/dev/walk-forks-compare.mjs --base https://127.0.0.1 --report /tmp/lf5-walk.json
//   node scripts/dev/walk-forks-compare.mjs --base https://127.0.0.1 --viewport 390x844 \
//        --only compare-layout --report /tmp/lf5-phone.json
//
// It drives a real Chromium (/snap/bin/chromium) over the DevTools protocol with
// Playwright's connectOverCDP, and checks server state through the real API.
// Fixture media is generated with FFmpeg (testsrc2) inside a folder called
// lf5-walk-<run id> under the dev share root; the link and files it creates are
// removed again unless --keep is given. Nothing else in the dev data is touched.
//
// The dev login (line 1 user, line 2 password of <dev state>/etc/dev-login) is
// read at run time and never printed or written to the report.
//
// Options
//   --base <url>        server origin, loopback host only (default https://127.0.0.1)
//   --report <file>     JSON report path (default /tmp/lf5-walk.json)
//   --viewport WxH      browser viewport (default 1280x900); a narrower-than-
//                       500px viewport also uses a touch user agent
//   --only <name>       compare-layout: just the layout checks (no fork dialog,
//                       no bandwidth measurement)
//   --shots <dir>       save a screenshot when a step fails
//   --keep              leave the fixture link and files in place
//   --chromium <path>   browser binary (default /snap/bin/chromium)
//   --bandwidth-seconds <n>   playback seconds per bandwidth measurement (default 12)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';

// The dev server's HTTPS certificate is self-signed.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.removeAllListeners('warning');

// ---- arguments ---------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    base: 'https://127.0.0.1', report: '/tmp/lf5-walk.json', viewport: '1280x900', only: 'all',
    shots: '', keep: false, chromium: '/snap/bin/chromium', bandwidthSeconds: 12,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--base') opts.base = next().replace(/\/+$/, '');
    else if (a === '--report') opts.report = next();
    else if (a === '--viewport') opts.viewport = next();
    else if (a === '--only') opts.only = next();
    else if (a === '--shots') opts.shots = next();
    else if (a === '--keep') opts.keep = true;
    else if (a === '--chromium') opts.chromium = next();
    else if (a === '--bandwidth-seconds') opts.bandwidthSeconds = Number(next());
    else throw new Error(`Unknown option ${a}`);
  }
  // TLS verification is off for the dev certificate and the dev password is sent:
  // only ever talk to this machine.
  let host = '';
  try { host = new URL(opts.base).hostname.replace(/^\[|\]$/g, ''); } catch {}
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error(`--base must be a loopback host (127.0.0.1, ::1, localhost), got ${opts.base}`);
  }
  const m = /^(\d+)x(\d+)$/.exec(opts.viewport);
  if (!m) throw new Error('--viewport must look like 390x844');
  opts.width = Number(m[1]);
  opts.height = Number(m[2]);
  if (!['all', 'compare-layout'].includes(opts.only)) throw new Error('--only must be compare-layout');
  return opts;
}

// ---- report ------------------------------------------------------------------

const report = {
  started: new Date().toISOString(), base: '', viewport: '', only: '', passed: 0, failed: 0,
  steps: [], notes: {}, bandwidth: null, sync: null,
};
let opts;

function record(name, ok, detail) {
  report.steps.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail) });
  if (ok) report.passed++;
  else report.failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !ok ? `  (${detail})` : ''}`);
}

function check(name, condition, detail) {
  record(name, !!condition, condition ? undefined : detail);
  return !!condition;
}

// A step that must not stop the walk: an exception is a failed step.
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    let where = '';
    try { where = shotPage ? ` [page text: ${(await shotPage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}]` : ''; } catch { /* best effort */ }
    record(name, false, `${e?.message || e}${where}`);
    if (shotPage && opts.shots) {
      try {
        fs.mkdirSync(opts.shots, { recursive: true });
        await shotPage.screenshot({ path: path.join(opts.shots, `${name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
      } catch { /* best effort */ }
    }
    return false;
  }
  return true;
}

let shotPage = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, fn, { timeout = 60000, every = 500 } = {}) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ''}`);
    await sleep(every);
  }
}

// ---- environment -------------------------------------------------------------

const devState = process.env.FLOW_DEV_STATE || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), '45flow-dev');

function shareRoot() {
  if (process.env.ROOT_DIR) return process.env.ROOT_DIR;
  const env = fs.readFileSync(path.join(devState, 'dev.env'), 'utf8');
  const m = /^ROOT_DIR="?([^"\n]+)"?\s*$/m.exec(env);
  if (!m) throw new Error(`No ROOT_DIR in ${path.join(devState, 'dev.env')}`);
  return m[1].replace(/^\$HOME/, os.homedir());
}

function devLogin() {
  const [user, password] = fs.readFileSync(path.join(devState, 'etc/dev-login'), 'utf8').split('\n');
  return { user: user.trim(), password };
}

function loadPlaywright() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const require = createRequire(path.join(process.env.FLOW_CLIENT_REPO || path.resolve(here, '../..'), 'package.json'));
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return require(name);
    } catch { /* try the next */ }
  }
  throw new Error('Playwright is not installed in the 45flow repo. Run `yarn install` there (it is a devDependency); this script installs nothing.');
}

function need(cmd) {
  try {
    execFileSync(cmd, ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error(`${cmd} is required to build the fixture media and was not found`);
  }
}

// ---- API ---------------------------------------------------------------------

let staffToken = '';

async function api(method, route, body, { staff = true, raw = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (staff) headers.authorization = `Bearer ${staffToken}`;
  const res = await fetch(opts.base + route, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return res;
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

async function staffLogin() {
  const { user, password } = devLogin();
  let res;
  // The login endpoint rate-limits repeated attempts; wait it out rather than fail.
  for (let attempt = 0; attempt < 8; attempt++) {
    res = await api('POST', '/api/login', { username: user, password }, { staff: false });
    if (res.status !== 429) break;
    await sleep(30000);
  }
  if (res.status !== 200 || !res.json?.token) throw new Error(`Dev login failed (HTTP ${res.status})`);
  staffToken = res.json.token;
}

// ---- fixtures ----------------------------------------------------------------

// 60 s 720p. The two versions differ in picture (hue and speed of the moving
// pattern) and audio pitch, so a pane showing the wrong version is visible.
function makeVideo(file, variant) {
  const lavfi = variant === 1
    ? 'testsrc2=size=1280x720:rate=25:duration=60'
    : 'testsrc2=size=1280x720:rate=25:duration=60,hue=h=140';
  const tone = variant === 1 ? 440 : 880;
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', lavfi,
    '-f', 'lavfi', '-i', `sine=frequency=${tone}:sample_rate=48000:duration=60`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-g', '50',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', file,
  ]);
}

// A small valid two-page PDF whose text says which version it is.
function makePdf(file, label) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');
  const page = (contentId) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents ${contentId} 0 R /Resources << /Font << /F1 7 0 R >> >> >>`;
  const stream = (text) => {
    const body = `BT /F1 28 Tf 30 150 Td (${text}) Tj ET`;
    return `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  };
  add(page(4));
  add(stream(`${label} page one`));
  add(page(6));
  add(stream(`${label} page two`));
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, out, 'latin1');
}

// Replace the file on disk, then ask the server for versions so it notices the change.
async function addVersion(fileId, write, file) {
  const before = (await api('GET', `/api/files/${fileId}/versions`)).json?.versions?.length || 0;
  // A different mtime is what makes the server see a new version.
  await sleep(1100);
  // Write beside it and rename, so the server never reads a half-written file.
  const tmp = path.join(path.dirname(file), `.tmp-${path.basename(file)}`);
  write(tmp);
  fs.renameSync(tmp, file);
  const now = new Date();
  fs.utimesSync(file, now, now);
  const versions = await until('a new version', async () => {
    const list = (await api('GET', `/api/files/${fileId}/versions`)).json?.versions || [];
    return list.length > before ? list : null;
  }, { timeout: 30000 });
  return versions;
}

// A fork copies the retained snapshot, which is written in the background.
async function waitSnapshots(fileId) {
  await until('version snapshots to be saved', async () => {
    const list = (await api('GET', `/api/files/${fileId}/versions`)).json?.versions || [];
    return list.length > 0 && list.every((v) => v.snapshot_rel);
  }, { timeout: 120000, every: 1000 });
}

const run = {
  id: `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${process.pid}`,
  dirRel: '',
  linkIds: [],
};

async function createLink(title, relPath) {
  const res = await api('POST', '/api/magic-link', {
    filePath: relPath, title, expiresInSeconds: 86400, proxy: true, baseMode: 'local',
    accessMode: 'open', authMode: 'none', allowComments: true,
  });
  if (res.status !== 200 || !res.json?.linkId) throw new Error(`Creating link ${title} failed: HTTP ${res.status} ${JSON.stringify(res.json)}`);
  run.linkIds.push(res.json.linkId);
  return { id: res.json.linkId, token: res.json.token, fileId: Number(res.json.file?.id), url: `${opts.base}/link/${res.json.token}` };
}

function versionsOf(list) {
  const byIndex = new Map(list.map((v) => [Number(v.version_index), Number(v.asset_version_id)]));
  return byIndex;
}

// ---- browser -----------------------------------------------------------------

let chromeProc = null;
let profileDir = '';

async function startChromium(pw) {
  if (!fs.existsSync(opts.chromium)) throw new Error(`Chromium not found at ${opts.chromium}`);
  // A snap-confined Chromium can only write under the home directory.
  profileDir = fs.mkdtempSync(path.join(os.homedir(), 'snap', 'chromium', 'common', 'lf5-walk-'));
  // Pick a port nothing answers on, so this never attaches to someone else's browser.
  let port = 0;
  for (let i = 0; i < 20 && !port; i++) {
    const candidate = 20000 + Math.floor(Math.random() * 20000);
    const taken = await fetch(`http://127.0.0.1:${candidate}/json/version`).then(() => true, () => false);
    if (!taken) port = candidate;
  }
  if (!port) throw new Error('No free local port for the browser');
  chromeProc = spawn(opts.chromium, [
    '--headless=new', '--no-sandbox', '--ignore-certificate-errors', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  chromeProc.on('error', () => {});
  const endpoint = `http://127.0.0.1:${port}`;
  await until('Chromium DevTools', async () => (await fetch(`${endpoint}/json/version`)).ok, { timeout: 30000, every: 300 });
  return pw.chromium.connectOverCDP(endpoint);
}

// A snap-confined Chromium can't always be signalled from outside, so ask it
// to quit over the protocol first and only then fall back to a signal.
async function stopChromium(browser) {
  try {
    const session = await browser?.newBrowserCDPSession();
    await session?.send('Browser.close');
  } catch { /* already gone */ }
  await sleep(500);
  if (chromeProc && chromeProc.exitCode === null) {
    const exited = new Promise((r) => chromeProc.once('exit', r));
    chromeProc.kill('SIGTERM');
    await Promise.race([exited, sleep(5000)]);
    if (chromeProc.exitCode === null) chromeProc.kill('SIGKILL');
  }
  if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
}

function contextOptions() {
  const phone = opts.width < 500;
  return {
    ignoreHTTPSErrors: true, viewport: { width: opts.width, height: opts.height },
    ...(phone ? {
      hasTouch: true, isMobile: true, deviceScaleFactor: 3,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    } : {}),
  };
}

// ---- share page helpers ------------------------------------------------------

const pane = (side) => `[data-testid="compare-pane-${side}"]`;

async function videoState(page, side) {
  return page.evaluate((sel) => {
    const v = document.querySelector(`${sel} video`);
    if (!v) return null;
    return { readyState: v.readyState, videoWidth: v.videoWidth, currentSrc: v.currentSrc, currentTime: v.currentTime, paused: v.paused, duration: v.duration };
  }, pane(side));
}

// A version with no web copy is prepared on demand, which takes a while for a 60 s 720p clip.
async function waitBothVideosReady(page, timeout = 480000) {
  return until('both videos to be ready', async () => {
    const [a, b] = [await videoState(page, 'a'), await videoState(page, 'b')];
    return a && b && a.readyState >= 3 && b.readyState >= 3 && a.videoWidth > 0 && b.videoWidth > 0 ? { a, b } : null;
  }, { timeout, every: 1000 });
}

async function openCompare(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="compare-workspace"]', { timeout: 60000 });
  return page;
}

async function seekBar(page, seconds) {
  await page.evaluate((t) => {
    const bar = document.querySelector('[data-testid="compare-bar"]');
    bar.value = String(t);
    bar.dispatchEvent(new Event('input', { bubbles: true }));
  }, seconds);
}

// ---- G1 steps ----------------------------------------------------------------

async function staffLoginUi(page) {
  // The admin setup check needs the privileged host broker, which a dev
  // environment doesn't run (it answers 503 and the app stops on "Could not
  // check server setup"). Answer as a server whose storage is already set up.
  await page.route('**/api/setup/status', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ready: true }),
  }));
  const { user, password } = devLogin();
  await page.goto(`${opts.base}/app/`, { waitUntil: 'domcontentloaded' });
  const userBox = page.locator('input[type="text"]').first();
  await userBox.waitFor({ timeout: 30000 });
  await userBox.fill(user);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), null, { timeout: 30000 });
}

async function skipTour(page) {
  // The first-run tours can pop up at any moment; dismiss whichever one appears.
  if (!page.__tourHandler) {
    page.__tourHandler = true;
    await page.addLocatorHandler(page.getByText('Skip tour').first(), async (el) => { await el.click(); });
  }
  const skip = page.getByText('Skip tour').first();
  if (await skip.isVisible({ timeout: 4000 }).catch(() => false)) await skip.click();
}

async function openLinkVersions(page, title) {
  await page.goto(`${opts.base}/app/#/`, { waitUntil: 'domcontentloaded' });
  await skipTour(page);
  // Links with no project sit under Unassigned.
  const row = page.getByText(title, { exact: false }).first();
  if (!(await row.isVisible({ timeout: 8000 }).catch(() => false))) {
    await page.getByText(/Unassigned Links/).first().click();
  }
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.click();
  await skipTour(page); // Link Details has its own first-run tour
  const tab = page.getByRole('tab', { name: /^Versions/ });
  await tab.waitFor({ timeout: 30000 });
  await tab.click();
  await page.locator('tr', { hasText: /^v1/ }).first().waitFor({ timeout: 30000 });
}

async function main() {
  opts = parseArgs(process.argv.slice(2));
  report.base = opts.base;
  report.viewport = opts.viewport;
  report.only = opts.only;

  const pw = loadPlaywright();
  need('ffmpeg');
  await staffLogin();

  const root = shareRoot();
  run.dirRel = `lf5-walk-${run.id}`;
  const dirAbs = path.join(root, run.dirRel);
  fs.mkdirSync(dirAbs, { recursive: true });
  report.notes.fixtureFolder = run.dirRel;

  const browser = await startChromium(pw);
  const context = await browser.newContext(contextOptions());

  try {
    // ---- fixtures: a video link with two versions, and a PDF link with two ----
    const videoAbs = path.join(dirAbs, 'clip.mp4');
    makeVideo(`${videoAbs}.part.mp4`, 1);
    fs.renameSync(`${videoAbs}.part.mp4`, videoAbs);
    const video = await createLink(`lf5-walk-video ${run.id}`, `${run.dirRel}/clip.mp4`);
    let list = await addVersion(video.fileId, (f) => makeVideo(f, 2), videoAbs);
    let vv = versionsOf(list);
    check('fixture: video has two versions', vv.size === 2 && vv.has(1) && vv.has(2), JSON.stringify([...vv]));
    await waitSnapshots(video.fileId);
    const origV1 = vv.get(1);
    const origV2 = vv.get(2);
    report.notes.video = { linkId: video.id, fileId: video.fileId, versions: [...vv] };

    let fork = null;
    if (opts.only === 'all') {
      fork = await walkFork({ context, video, vv });
    } else {
      fork = await forkViaApi({ video, origV2 });
    }

    if (opts.only === 'all' && fork && fork.attached) {
      await compareChecks({ context, video, origV1, origV2, fork });
    }

    await layoutChecks({ context, video, origV2, fork, dirAbs });

    if (opts.only === 'all' && fork?.attached) {
      await measureBandwidth({ browser, video, origV2, fork });
    }
  } finally {
    report.finished = new Date().toISOString();
    await context.close().catch(() => {});
    await stopChromium(browser);
    if (!opts.keep) await removeFixtures(dirAbs, run.linkIds);
  }
}

async function forkViaApi({ video, origV2 }) {
  const res = await api('POST', `/api/files/${video.fileId}/forks`, {
    sourceVersionId: origV2, destRelDir: run.dirRel, filename: 'clip-social-cut.mp4', label: 'Social Cut',
    idempotencyKey: `lf5-walk-${run.id}`,
  });
  if (!check('fork created through the API', res.status === 202, `HTTP ${res.status} ${JSON.stringify(res.json)}`)) return null;
  const done = await waitForkJob(res.json.jobId);
  if (!check('fork job done', done?.state === 'done', JSON.stringify(done))) return null;
  const relPath = `${run.dirRel}/clip-social-cut.mp4`;
  const attach = await attachFork(video, relPath);
  if (!check('fork attached through the API', attach.status === 200, `HTTP ${attach.status} ${JSON.stringify(attach.json)}`)) return null;
  return { fileId: done.fileId, relPath, attached: true };
}

// Attach the way Edit -> Files does by default: the file list alone, no web-copy
// options (the app adds them only when adaptive streaming is switched on). The
// fork therefore has no web copy of its own until compare asks for one.
function attachFork(video, forkRelPath) {
  return api('PUT', `/api/links/${video.id}/files`, {
    filePaths: [`${run.dirRel}/clip.mp4`, forkRelPath],
  });
}

async function waitForkJob(jobId) {
  return until('the fork job to finish', async () => {
    const j = (await api('GET', `/api/fork-jobs/${jobId}`)).json;
    if (j?.state === 'failed') throw new Error(`fork failed: ${j.errorCode}`);
    return j?.state === 'done' ? j : null;
  }, { timeout: 120000, every: 500 });
}

// Steps 1 to 3: fork v2 as "Social Cut" without adding it to the link, check
// it is hidden from the share page, then attach it.
async function walkFork({ context, video, vv }) {
  const page = await context.newPage();
  shotPage = page;
  const fork = { fileId: null, relPath: '', attached: false };
  await step('staff signs in to the web app', async () => {
    await staffLoginUi(page);
    record('staff signs in to the web app', true);
  });
  const ok = await step('1. open Link Details, Versions', async () => {
    await openLinkVersions(page, video.id ? `lf5-walk-video ${run.id}` : '');
  });
  if (!ok) { await page.close(); return null; }

  await step('1. fork v2 as Social Cut, not added to the link', async () => {
    const row = page.locator('tr', { hasText: /^v2/ }).first();
    await row.getByRole('button', { name: 'Fork from this version' }).click();
    const dialog = page.getByRole('dialog', { name: 'Fork this version' });
    await dialog.waitFor({ timeout: 15000 });
    await dialog.getByTestId('fork-label').fill('Social Cut');
    const attach = dialog.getByTestId('fork-attach');
    const attachDefault = await attach.isChecked();
    check('"Add to this link" is off by default', attachDefault === false, `checked=${attachDefault}`);
    const name = await dialog.getByTestId('fork-filename').inputValue();
    const folder = await dialog.getByTestId('fork-folder').inputValue();
    fork.relPath = [folder.replace(/^\/+|\/+$/g, ''), name].filter(Boolean).join('/');
    await dialog.getByTestId('fork-submit').click();
    await dialog.getByText('Fork created.').waitFor({ timeout: 120000 });
    record('1. fork reaches done', true);
    await dialog.locator('footer').getByRole('button', { name: 'Close' }).click();
  });

  await step('1. fork recorded on the server', async () => {
    const lin = (await api('GET', `/api/files/${video.fileId}/lineage`)).json;
    const member = (lin?.family || []).find((m) => m.label === 'Social Cut');
    if (!check('server lineage has the Social Cut fork of Original v2', member && Number(member.forkedFrom?.assetVersionId) === vv.get(2), JSON.stringify(lin?.family)))
      throw new Error('fork missing from lineage');
    fork.fileId = Number(member.fileId);
    fork.versions = versionsOf((await api('GET', `/api/files/${fork.fileId}/versions`)).json?.versions || []);
  });

  await step('2. fork is not visible on the share page', async () => {
    const meta = await api('GET', `/meta/${video.token}`, undefined, { staff: false });
    const names = JSON.stringify(meta.json || {});
    check('share page metadata does not list the fork', meta.status === 200 && !names.includes('social-cut'), `HTTP ${meta.status}`);
    const lin = await api('GET', `/api/token/${video.token}/files/${video.fileId}/lineage`, undefined, { staff: false });
    const ids = (lin.json?.family || []).map((m) => Number(m.fileId));
    check('recipient lineage does not include the unattached fork', lin.status === 200 && !ids.includes(fork.fileId), JSON.stringify(lin.json));
  });

  await step('3. attach the fork to the link', async () => {
    const res = await attachFork(video, fork.relPath);
    if (res.status !== 200) throw new Error(`attach failed: HTTP ${res.status} ${JSON.stringify(res.json)}`);
    const lin = await api('GET', `/api/token/${video.token}/files/${video.fileId}/lineage`, undefined, { staff: false });
    const ids = (lin.json?.family || []).map((m) => Number(m.fileId));
    check('fork is attached: recipient lineage now includes it', ids.includes(fork.fileId), JSON.stringify(lin.json));
    fork.attached = ids.includes(fork.fileId);
  });

  await step('4. Compare with… opens the share page', async () => {
    // Reopen the link so the Versions tab reloads lineage and file list.
    await openLinkVersions(page, `lf5-walk-video ${run.id}`);
    const row = page.locator('tr', { hasText: /^v2/ }).first();
    const btn = row.getByTestId('compare-with');
    await until('Compare with… to be enabled', async () => btn.isEnabled(), { timeout: 20000 });
    await btn.click();
    const target = page.getByTestId('compare-target');
    await target.waitFor({ timeout: 10000 });
    const forkOption = (await target.locator('option').allInnerTexts()).find((t) => t.startsWith('Social Cut · v1'));
    if (!check('Compare with… offers Social Cut v1', forkOption, JSON.stringify(await target.locator('option').allInnerTexts()))) throw new Error('no fork option');
    await target.selectOption({ label: forkOption });
    const popupPromise = context.waitForEvent('page', { timeout: 20000 });
    await page.getByTestId('compare-open').click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/link\//, { timeout: 30000 });
    await popup.waitForLoadState('domcontentloaded');
    const url = new URL(popup.url());
    const compare = url.searchParams.get('compare');
    const expected = `${vv.get(2)},${fork.versions.get(1)}`;
    check('share page opens with ?compare=<Original v2>,<Social Cut v1>', compare === expected, `got ${compare}, wanted ${expected}`);
    check('share page is this link', url.pathname === `/link/${video.token}`, url.pathname);
    fork.popup = popup;
  });
  await page.close().catch(() => {});
  shotPage = null;
  return fork;
}

// Steps 4 to 8 (the share page and the server state it leaves behind).
async function compareChecks({ context, video, origV1, origV2, fork }) {
  const forkV1 = fork.versions?.get(1) ?? Number([...((await api('GET', `/api/files/${fork.fileId}/versions`)).json?.versions || [])][0]?.asset_version_id);
  let page = fork.popup || null;
  if (opts.only !== 'all' || !page) {
    page = await openCompare(context, `${video.url}?compare=${origV2},${forkV1}`);
  } else {
    await page.waitForSelector('[data-testid="compare-workspace"]', { timeout: 60000 });
  }
  shotPage = page;

  await step('5. both videos play from their own version', async () => {
    const { a, b } = await waitBothVideosReady(page);
    check('5. both videos reach readyState >= 3 with a picture', a.readyState >= 3 && b.readyState >= 3 && a.videoWidth > 0 && b.videoWidth > 0, JSON.stringify({ a, b }));
    check('5. the two videos have different currentSrc', a.currentSrc && b.currentSrc && a.currentSrc !== b.currentSrc, `${a.currentSrc} | ${b.currentSrc}`);
  });

  await step('6. seek the shared bar to 30 s', async () => {
    await seekBar(page, 30);
    const times = await until('both videos to land near 30 s', async () => {
      const [a, b] = [await videoState(page, 'a'), await videoState(page, 'b')];
      return a && b && Math.abs(a.currentTime - 30) < 1 && Math.abs(b.currentTime - 30) < 1 && a.paused && b.paused ? { a: a.currentTime, b: b.currentTime } : null;
    }, { timeout: 60000, every: 300 });
    // Let both settle (seeked) and read again.
    await sleep(1500);
    const [a, b] = [await videoState(page, 'a'), await videoState(page, 'b')];
    report.sync = { targetSeconds: 30, aSeconds: a.currentTime, bSeconds: b.currentTime, aErrorSeconds: a.currentTime - 30, bErrorSeconds: b.currentTime - 30, toleranceSeconds: 0.04, firstRead: times };
    // Informational: how far apart the two sides drift while playing (not a gate).
    await page.getByTestId('compare-play').click();
    await sleep(4000);
    const [pa, pb] = [await videoState(page, 'a'), await videoState(page, 'b')];
    await page.getByTestId('compare-play').click();
    report.sync.playSkewSeconds = Number((pa.currentTime - pb.currentTime).toFixed(3));
    // Back to 30 s for the comment that follows.
    await seekBar(page, 30);
    await until('both videos to return to 30 s', async () => {
      const [a2, b2] = [await videoState(page, 'a'), await videoState(page, 'b')];
      return a2 && b2 && Math.abs(a2.currentTime - 30) < 0.5 && Math.abs(b2.currentTime - 30) < 0.5 && a2.paused && b2.paused;
    }, { timeout: 60000, every: 300 });
    check('6. both currentTime values are within 0.04 s of 30', Math.abs(a.currentTime - 30) <= 0.04 && Math.abs(b.currentTime - 30) <= 0.04,
      `A ${a.currentTime.toFixed(3)} (err ${(a.currentTime - 30).toFixed(3)}), B ${b.currentTime.toFixed(3)} (err ${(b.currentTime - 30).toFixed(3)})`);
  });

  await step('7. comment on side A at 30 s', async () => {
    const body = `lf5-walk comment ${run.id}`;
    await page.getByTestId('compare-target-a').first().click();
    const box = page.locator('textarea[placeholder="Write a comment…"]:visible').first();
    await box.fill(body);
    const add = page.getByRole('button', { name: /^(Add comment|Login)$/ }).filter({ visible: true }).first();
    await add.click();
    // An open link asks for a display name the first time.
    const nameBox = page.getByRole('dialog').getByRole('textbox').first();
    if (await nameBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameBox.fill('LF5 Walker');
      await page.getByRole('dialog').getByRole('button', { name: /continue|save|ok|join|start|submit/i }).first().click();
      await sleep(500);
      if (await box.isVisible().catch(() => false)) {
        if (!(await box.inputValue())) await box.fill(body);
        await page.getByRole('button', { name: /^Add comment$/ }).filter({ visible: true }).first().click();
      }
    }
    const rows = await until('the comment to reach the server', async () => {
      const r = (await api('GET', `/api/token/${video.token}/comments?file_id=${video.fileId}&asset_version_id=${origV2}`, undefined, { staff: false })).json;
      const flat = [];
      const walk = (items) => (items || []).forEach((c) => { flat.push(c); walk(c.replies); });
      walk(r?.items);
      const hit = flat.filter((c) => String(c.body || '').includes(body));
      return hit.length ? hit : null;
    }, { timeout: 30000, every: 700 });
    const c = rows[0];
    check('7. the comment is stored on Original v2', Number(c.asset_version_id) === origV2, JSON.stringify({ asset_version_id: c.asset_version_id, origV2 }));
    check('7. the comment time is 30', Math.abs(Number(c.start_seconds) - 30) <= 0.5, `start_seconds=${c.start_seconds}`);
    const onFork = (await api('GET', `/api/token/${video.token}/comments?file_id=${fork.fileId}`, undefined, { staff: false })).json;
    const leaked = JSON.stringify(onFork?.items || []).includes(body);
    check('7. the comment is not on the Social Cut file', !leaked, 'comment appeared under the fork');
  });

  await step('8. deleting Original v2 is refused with 409', async () => {
    const res = await api('DELETE', `/api/files/${video.fileId}/versions/${origV2}`);
    check('8. DELETE Original v2 returns 409', res.status === 409, `HTTP ${res.status} ${JSON.stringify(res.json)}`);
    const list = (await api('GET', `/api/files/${video.fileId}/versions`)).json?.versions || [];
    check('8. Original v2 is still there', list.some((v) => Number(v.asset_version_id) === origV2), 'version gone');
  });

  await page.close().catch(() => {});
  shotPage = null;
}

// ---- G2: layout --------------------------------------------------------------

async function layoutChecks({ context, video, origV2, fork, dirAbs }) {
  const w = opts.width;
  const phone = w < 500;
  // Video pair
  if (fork?.attached) {
    const forkV1 = fork.versions?.get(1) ?? Number(((await api('GET', `/api/files/${fork.fileId}/versions`)).json?.versions || [])[0]?.asset_version_id);
    await step('layout: video compare', async () => {
      const page = await openCompare(context, `${video.url}?compare=${origV2},${forkV1}`);
      shotPage = page;
      await waitBothVideosReady(page);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      check(`layout: document scrollWidth <= ${w}`, scrollWidth <= w, `scrollWidth=${scrollWidth}`);
      const boxes = { a: await page.locator(pane('a')).boundingBox(), b: await page.locator(pane('b')).boundingBox() };
      check('layout: both video panes have a size', boxes.a && boxes.b && boxes.a.width > 0 && boxes.a.height > 0 && boxes.b.width > 0 && boxes.b.height > 0, JSON.stringify(boxes));
      if (phone) check('layout: panes are stacked, A above B', boxes.a && boxes.b && boxes.a.y < boxes.b.y && boxes.b.y >= boxes.a.y + boxes.a.height - 2, JSON.stringify(boxes));
      else check('layout: panes sit side by side', boxes.a && boxes.b && boxes.a.x < boxes.b.x, JSON.stringify(boxes));
      const timelines = await page.locator('[data-testid="compare-timeline"]').count();
      check('layout: exactly one timeline element', timelines === 1, `count=${timelines}`);
      const layout = await page.getByTestId('compare-workspace').getAttribute('data-layout');
      check(`layout: workspace is ${phone ? 'stacked' : 'side-by-side'}`, layout === (phone ? 'stacked' : 'side-by-side'), layout);
      await page.close();
      shotPage = null;
    });
  }

  // PDF pair (two versions of one file)
  await step('layout: PDF compare', async () => {
    const pdfAbs = path.join(dirAbs, 'doc.pdf');
    makePdf(`${pdfAbs}.part`, 'Version one');
    fs.renameSync(`${pdfAbs}.part`, pdfAbs);
    const pdf = await createLink(`lf5-walk-pdf ${run.id}`, `${run.dirRel}/doc.pdf`);
    const list = await addVersion(pdf.fileId, (f) => makePdf(f, 'Version two'), pdfAbs);
    const vv = versionsOf(list);
    const page = await openCompare(context, `${pdf.url}?compare=${vv.get(1)},${vv.get(2)}`);
    shotPage = page;
    await until('a PDF page to render', async () => page.locator('canvas, [data-testid^="pdf-page-"]').first().isVisible(), { timeout: 60000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`layout: PDF compare scrollWidth <= ${w}`, scrollWidth <= w, `scrollWidth=${scrollWidth}`);
    if (phone) {
      const toggle = page.getByTestId('compare-side-toggle');
      check('layout: PDF pair shows the A | B toggle', await toggle.isVisible(), 'toggle hidden');
      const visible = async (s) => page.locator(pane(s)).isVisible();
      check('layout: PDF pair shows exactly one pane', (await visible('a')) !== (await visible('b')), `a=${await visible('a')} b=${await visible('b')}`);
      const first = (await visible('a')) ? 'a' : 'b';
      const other = first === 'a' ? 'b' : 'a';
      await page.getByTestId(`compare-show-${other}`).click();
      await until('the other pane to show', async () => (await visible(other)) && !(await visible(first)), { timeout: 10000, every: 200 });
      record('layout: the A | B toggle swaps the pane', true);
    } else {
      const boxes = { a: await page.locator(pane('a')).boundingBox(), b: await page.locator(pane('b')).boundingBox() };
      check('layout: both PDF panes are shown on a wide screen', boxes.a && boxes.b, JSON.stringify(boxes));
    }
    await page.close();
    shotPage = null;
  });
}

// ---- bandwidth ---------------------------------------------------------------

// Bytes the browser pulls for both panes while they play, in Best and in Data
// Saver. The compare view has no mode switch of its own, so the mode is chosen
// on the single-file share page and carries into Compare.
async function measureBandwidth({ browser, video, origV2, fork }) {
  const forkV1 = fork.versions?.get(1);
  const result = { dataSaver: false, bothSidesMbps: 0, windowSeconds: opts.bandwidthSeconds, best: null, dataSaverMeasured: null };
  await step('bandwidth: both panes in Best and Data Saver', async () => {
    for (const mode of ['Best', 'Data Saver']) {
      // A fresh browser context per mode: its HTTP and media caches are empty, so
      // each pane fetches its own media from the network and every byte of it is
      // counted from navigation on (a pane buffered earlier would read as 0).
      const ctx = await browser.newContext(contextOptions());
      const page = await ctx.newPage();
      shotPage = page;
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      try {
      const urls = new Map();
      const bytes = { a: 0, b: 0, other: 0 };
      // Each pane's media URL prefixes (its own asset version), learned from the
      // pane's video once it has loaded; the version ids are the fallback.
      const keys = { a: [`asset_version_id=${origV2}`, `/${origV2}/`], b: [`asset_version_id=${forkV1}`, `/${forkV1}/`] };
      const learnKeys = async () => {
        for (const side of ['a', 'b']) {
          const st = await videoState(page, side);
          if (!st?.currentSrc || st.currentSrc.startsWith('blob:')) continue;
          const u = new URL(st.currentSrc);
          const dir = `${u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1)}`;
          if (dir.length > 1 && !keys[side].includes(dir)) keys[side].push(dir);
        }
      };
      cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
      cdp.on('Network.dataReceived', (e) => {
        const url = urls.get(e.requestId) || '';
        if (!/\/(stream|v|hls|media|download|transcodes)\/|\.(m4s|ts|mp4|aac|m3u8)(\?|$)/i.test(url)) return;
        const side = keys.a.some((k) => url.includes(k)) ? 'a' : keys.b.some((k) => url.includes(k)) ? 'b' : 'other';
        bytes[side] += e.encodedDataLength || e.dataLength || 0;
      });
      await page.goto(`${video.url}?version=${origV2}`, { waitUntil: 'domcontentloaded' });
      const modeButton = page.getByRole('radio', { name: mode, exact: true }).first();
      await modeButton.waitFor({ timeout: 90000 });
      await modeButton.click();
      await page.getByTestId('compare-switch').click();
      await page.waitForSelector('[data-testid="compare-workspace"]', { timeout: 60000 });
      await page.getByTestId('version-picker-b').selectOption(String(forkV1));
      await waitBothVideosReady(page);
      await learnKeys();
      const t0 = Date.now();
      const playBtn = page.getByTestId('compare-play');
      if (!(await page.evaluate(() => [...document.querySelectorAll('[data-testid^="compare-pane-"] video')].every((v) => !v.paused)))) await playBtn.click();
      await sleep(opts.bandwidthSeconds * 1000);
      const seconds = (Date.now() - t0) / 1000;
      const states = [await videoState(page, 'a'), await videoState(page, 'b')];
      // Bytes fetched for a pane over the media seconds it played from a cold start.
      const mbps = (n, played = seconds) => Number(((n * 8) / Math.max(1, played) / 1e6).toFixed(3));
      const sides = { aMbps: mbps(bytes.a, states[0]?.currentTime), bMbps: mbps(bytes.b, states[1]?.currentTime), unattributedMbps: mbps(bytes.other) };
      const both = Number((sides.aMbps + sides.bMbps).toFixed(3));
      const out = { ...sides, bothSidesMbps: both, seconds: Number(seconds.toFixed(1)), pictureHeights: await page.evaluate(() => [...document.querySelectorAll('[data-testid^="compare-pane-"] video')].map((v) => v.videoHeight)), played: states.map((s) => s && Number(s.currentTime.toFixed(2))) };
      check(`bandwidth: both panes moved data in ${mode}`, out.aMbps > 0 && out.bMbps > 0, JSON.stringify(out));
      check(`bandwidth: ${mode} both = A + B`, Math.abs(out.bothSidesMbps - (out.aMbps + out.bMbps)) < 0.01, JSON.stringify(out));
      if (mode === 'Best') result.best = out;
      else {
        result.dataSaverMeasured = out;
        result.dataSaver = true;
        result.bothSidesMbps = both;
      }
      } finally {
        await ctx.close().catch(() => {});
        shotPage = null;
      }
    }
    check('bandwidth: both panes moved data in Data Saver', result.bothSidesMbps > 0, JSON.stringify(result));
    check('bandwidth: Best was measured', (result.best?.bothSidesMbps || 0) > 0, JSON.stringify(result));
  });
  report.bandwidth = result;
}

// ---- cleanup -----------------------------------------------------------------

async function removeFixtures(dirAbs, linkIds) {
  // Links first (that releases the files), then the fixture folder. Deleting a
  // link never deletes media; the files and their versions stay in the share
  // root, so the whole folder goes.
  for (const id of linkIds) {
    const r = await api('DELETE', `/api/links/${id}`).catch(() => null);
    if (!r || ![200, 204, 404].includes(r.status)) report.notes.cleanup = `link ${id} delete: ${r?.status}`;
  }
  try { fs.rmSync(dirAbs, { recursive: true, force: true }); } catch (e) { report.notes.cleanupFolder = String(e?.message || e); }
}

// ---- go ----------------------------------------------------------------------

let exitCode = 0;
try {
  await main();
} catch (e) {
  record('walk completed', false, e?.message || e);
}
if (report.failed > 0) exitCode = 1;
report.exitCode = exitCode;
fs.writeFileSync(opts?.report || '/tmp/lf5-walk.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${report.passed} passed, ${report.failed} failed. Report: ${opts?.report}`);
process.exit(exitCode);
