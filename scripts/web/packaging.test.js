// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { packageManifest, WEB_ROOT } from './lib.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const manifest = JSON.parse(read('manifest.json'))
let work

afterEach(() => {
  if (work) fs.rmSync(work, { recursive: true, force: true })
  work = null
})

describe('repository packaging', () => {
  it('derives both manifest versions from the app and preserves repository/revision settings', () => {
    const originalVersion = manifest.version
    const updated = packageManifest({ version: '2.0.0-beta.1' }, { ...manifest, build_number: '3' })
    expect(updated.version).toBe('2.0.0~beta.1')
    expect(updated.changelog.version).toBe(updated.version)
    expect(updated.build_number).toBe('3')
    expect(updated.changelog.build_number).toBe('3')
    expect(updated.repos).toEqual(['enterprise', 'community'])
    expect(manifest.version).toBe(originalVersion)
  })

  it('covers the six Broadcaster distributions with architecture-independent packages', () => {
    expect(manifest.name).toBe('45flow-web')
    expect(manifest.architecture).toEqual({ debian: 'all', ubuntu: 'all', rocky: 'noarch' })
    expect(manifest.builds.map((b) => b.os_name).sort()).toEqual([
      'debian-bookworm', 'debian-trixie', 'rocky-el8', 'rocky-el9', 'ubuntu-focal', 'ubuntu-jammy',
    ])
    for (const build of manifest.builds) {
      const base = `packaging/${build.os_name}`
      if (build.group === 'rocky') {
        const spec = read(`${base}/main.spec.j2`)
        expect(spec).toContain('BuildArch:      {{ architecture.rocky }}')
        expect(spec).toContain('make web-install DESTDIR=%{buildroot}')
        expect(spec).not.toContain('Requires:')
      } else {
        expect(read(`${base}/control.j2`)).toContain(`Architecture: {{ architecture.${build.group} }}`)
        expect(read(`${base}/control.j2`)).not.toMatch(/^Depends:/m)
        expect(read(`${base}/rules`)).toContain('include packaging/debian.rules')
        expect(read(`${base}/source/format`)).toContain('3.0 (native)')
        expect(read(`${base}/copyright.j2`)).toContain('GPL-3.0')
        expect(read(`${base}/changelog`)).toContain('45flow-web (')
      }
    }
  })

  it('stages only the built web tree with readable, non-writable permissions', () => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-web-stage-'))
    const bundle = path.join(work, 'bundle')
    const dest = path.join(work, 'dest')
    fs.mkdirSync(path.join(bundle, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(bundle, 'index.html'), '<html></html>')
    fs.writeFileSync(path.join(bundle, 'version.json'), '{"name":"45flow-web","version":"1.0.9"}')
    fs.writeFileSync(path.join(bundle, 'assets', 'app.js'), 'console.log("app")')
    execFileSync('make', ['web-install', `WEB_BUILD_DIR=${bundle}`, `DESTDIR=${dest}`], { cwd: root })
    const installed = path.join(dest, WEB_ROOT)
    expect(fs.readdirSync(installed).sort()).toEqual(['assets', 'index.html', 'version.json'])
    expect(fs.statSync(installed).mode & 0o777).toBe(0o755)
    expect(fs.statSync(path.join(installed, 'assets', 'app.js')).mode & 0o777).toBe(0o644)
    expect(fs.existsSync(path.join(dest, 'etc'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'usr'))).toBe(false)
  })

  it('rejects a missing version.json rather than staging an unversioned package', () => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-web-stage-'))
    const bundle = path.join(work, 'bundle')
    fs.mkdirSync(bundle)
    fs.writeFileSync(path.join(bundle, 'index.html'), '<html></html>')
    expect(() => execFileSync('make', ['web-install', `WEB_BUILD_DIR=${bundle}`, `DESTDIR=${work}/dest`], { cwd: root, stdio: 'pipe' })).toThrow()
    expect(fs.existsSync(path.join(work, 'dest'))).toBe(false)
  })
})
