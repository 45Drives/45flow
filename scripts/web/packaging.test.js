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
        const codename = build.os_name.split('-')[1]
        // update-repo publishes 45flow-web_<version>-<build><codename>_all.deb; any other
        // changelog version builds fine but is silently never added to the repo.
        expect(read(`${base}/changelog`).split('\n')[0])
          .toBe(`45flow-web (${manifest.version}-${manifest.build_number}${codename}) ${codename}; urgency=medium`)
      }
    }
  })

  it('ci-prepare rewrites every debian changelog to the version update-repo publishes', () => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-web-prepare-'))
    fs.mkdirSync(path.join(work, 'scripts/web'), { recursive: true })
    fs.copyFileSync(path.join(root, 'scripts/web/ci-prepare.sh'), path.join(work, 'scripts/web/ci-prepare.sh'))
    fs.writeFileSync(path.join(work, 'package.json'), '{\n  "name": "45flow",\n  "version": "2.0.0-beta.1"\n}\n')
    fs.writeFileSync(path.join(work, 'manifest.json'), read('manifest.json').replaceAll('"build_number": "1"', '"build_number": "3"'))
    const debBuilds = manifest.builds.filter((b) => b.group !== 'rocky')
    for (const build of debBuilds) {
      fs.mkdirSync(path.join(work, 'packaging', build.os_name), { recursive: true })
      fs.writeFileSync(path.join(work, 'packaging', build.os_name, 'changelog'), 'stale\n')
    }
    const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: 'pipe' }).trim()
    git('init', '-q')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'release')
    execFileSync('sh', ['scripts/web/ci-prepare.sh', git('rev-parse', 'HEAD'), '2.0.0-beta.1'], { cwd: work, stdio: 'pipe' })

    for (const build of debBuilds) {
      const codename = build.os_name.split('-')[1]
      const changelog = fs.readFileSync(path.join(work, 'packaging', build.os_name, 'changelog'), 'utf8')
      expect(changelog.split('\n')[0]).toBe(`45flow-web (2.0.0~beta.1-3${codename}) ${codename}; urgency=medium`)
      expect(changelog).toMatch(/^ -- 45Drives <info@45drives\.com>  \w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/m)
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
