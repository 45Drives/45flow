// Build the 45flow-web bundle and package it as .tar.gz, .deb and .rpm with checksums.
//   node scripts/web/package.mjs            -> build/web-packages/
//
// The packages install the static files to /opt/45drives/45flow-web, where the
// Houston Broadcaster's nginx serves them at /app behind the admin allowlist.
// Set SOURCE_DATE_EPOCH for reproducible output.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { buildWeb, buildDate, root } from './build.mjs'
import { WEB_ROOT, debControl, debFileName, rpmFileName, rpmSpec, tarFileName } from './lib.mjs'

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...options })
const have = (cmd) => { try { run('which', [cmd]); return true } catch { return false } }

function maintainerOf(pkg) {
  const a = pkg.author
  return a && typeof a === 'object' ? `${a.name} <${a.email}>` : String(a || '45Drives <noreply@45drives.com>')
}

function dirSizeKb(dir) {
  return Math.max(1, Math.ceil(Number(run('du', ['-sk', dir]).split(/\s/)[0])))
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function makeTar(stage, file, epoch) {
  // Sorted, root-owned and dated by SOURCE_DATE_EPOCH, with no gzip timestamp, so the bytes repeat.
  const tar = execFileSync('tar', [
    '--sort=name', `--mtime=@${epoch}`, '--owner=0', '--group=0', '--numeric-owner', '-cf', '-', '-C', stage, '.',
  ], { maxBuffer: 1 << 30 })
  fs.writeFileSync(file, execFileSync('gzip', ['-n', '-9'], { input: tar, maxBuffer: 1 << 30 }))
}

function makeDeb(stage, file, { version, maintainer, epoch }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-deb-'))
  try {
    const payload = path.join(work, WEB_ROOT)
    fs.mkdirSync(payload, { recursive: true })
    fs.cpSync(stage, payload, { recursive: true })
    run('chmod', ['-R', 'u=rwX,go=rX', work])
    // The files are the payload; DEBIAN carries the metadata. Dates follow SOURCE_DATE_EPOCH.
    run('find', [work, '-exec', 'touch', '-h', '-d', `@${epoch}`, '{}', '+'])
    fs.mkdirSync(path.join(work, 'DEBIAN'))
    fs.writeFileSync(path.join(work, 'DEBIAN', 'control'), debControl({ version, maintainer, installedSizeKb: dirSizeKb(stage) }))
    run('dpkg-deb', ['--root-owner-group', '-Zgzip', '--build', work, file])
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

function makeRpm(stage, file, { version, maintainer, date, epoch }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-rpm-'))
  try {
    for (const d of ['BUILD', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS']) fs.mkdirSync(path.join(top, d))
    const spec = path.join(top, 'SPECS', '45flow-web.spec')
    fs.writeFileSync(spec, rpmSpec({ version, maintainer, date }))
    run('rpmbuild', [
      '-bb', '--quiet', '--target', 'noarch',
      '--define', `_topdir ${top}`, '--define', `stage ${stage}`,
      // Pin the build time, host and file dates so the same inputs give the same RPM.
      '--define', 'use_source_date_epoch_as_buildtime 1', '--define', 'clamp_mtime_to_source_date_epoch 1',
      '--define', '_buildhost reproducible', spec,
    ], { env: { ...process.env, SOURCE_DATE_EPOCH: String(epoch) } })
    const built = fs.readdirSync(path.join(top, 'RPMS', 'noarch')).find((f) => f.endsWith('.rpm'))
    fs.copyFileSync(path.join(top, 'RPMS', 'noarch', built), file)
  } finally {
    fs.rmSync(top, { recursive: true, force: true })
  }
}

export async function packageWeb() {
  const { outDir, info, pkg } = await buildWeb()
  const date = buildDate()
  const epoch = Math.floor(Date.parse(date) / 1000)
  const maintainer = maintainerOf(pkg)
  const out = path.join(root, 'build', 'web-packages')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })

  const files = []
  const tar = path.join(out, tarFileName(info.version))
  makeTar(outDir, tar, epoch)
  files.push(tar)

  if (have('dpkg-deb')) {
    const deb = path.join(out, debFileName(info.version))
    makeDeb(outDir, deb, { version: info.version, maintainer, epoch })
    files.push(deb)
  } else console.warn('dpkg-deb not found: skipping the .deb')

  if (have('rpmbuild')) {
    const rpm = path.join(out, rpmFileName(info.version))
    makeRpm(outDir, rpm, { version: info.version, maintainer, date, epoch })
    files.push(rpm)
  } else console.warn('rpmbuild not found: skipping the .rpm')

  fs.writeFileSync(path.join(out, 'SHA256SUMS'), files.map((f) => `${sha256(f)}  ${path.basename(f)}`).join('\n') + '\n')
  return { out, files, info }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { out, files, info } = await packageWeb()
  console.log(`45flow-web ${info.version} packaged in ${path.relative(root, out)}:`)
  for (const f of files) console.log(`  ${path.basename(f)}`)
  console.log('  SHA256SUMS')
}
