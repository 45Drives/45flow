// Build the 45flow-web bundle into build/web with a version.json beside index.html.
//   node scripts/web/build.mjs
//
// This is the same renderer the desktop app uses; in a browser it runs on the
// window.electron shim (src/renderer/ipc-web-shim.ts). It is built into its own
// folder so it never touches the desktop build output.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import fixCss from '../fix-css.js'
import { versionInfo } from './lib.mjs'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const outDir = path.join(root, 'build', 'web')

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** SOURCE_DATE_EPOCH (seconds) makes the date, and therefore the packages, reproducible. */
export function buildDate(env = process.env) {
  const epoch = Number(env.SOURCE_DATE_EPOCH)
  return new Date(Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : Date.now()).toISOString()
}

export async function buildWeb() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  // The vite config resolves paths from the working directory.
  process.chdir(root)
  fixCss()
  await build({
    configFile: path.join(root, 'vite.config.mjs'),
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  })
  const info = versionInfo({
    version: pkg.version,
    commit: git('rev-parse', '--short', 'HEAD'),
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
    buildDate: buildDate(),
  })
  fs.writeFileSync(path.join(outDir, 'version.json'), `${JSON.stringify(info, null, 2)}\n`)
  return { outDir, info, pkg }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { outDir: dir, info } = await buildWeb()
  console.log(`Built 45flow-web ${info.version} (${info.commit ?? 'no git'}) in ${path.relative(root, dir)}`)
}
