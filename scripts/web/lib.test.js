import { describe, expect, it } from 'vitest'
import {
  assertVersion, debControl, debFileName, debVersion, rpmChangelogDate, rpmFileName, rpmSpec, rpmVersion, tarFileName, versionInfo, WEB_ROOT,
} from './lib.mjs'

describe('versions', () => {
  it('accepts releases and pre-releases, and rejects anything else', () => {
    expect(assertVersion('1.0.9')).toBe('1.0.9')
    expect(assertVersion('1.2.0-beta.1')).toBe('1.2.0-beta.1')
    for (const bad of ['1.0', 'v1.0.9', '1.0.9+build', '1.0.9-', '', 'latest']) {
      expect(() => assertVersion(bad), bad).toThrow(/Unsupported version/)
    }
  })

  it('maps a pre-release to ~ so it sorts before the release in deb and rpm', () => {
    expect(debVersion('1.2.0-beta.1')).toBe('1.2.0~beta.1')
    expect(rpmVersion('1.2.0-beta.1')).toBe('1.2.0~beta.1')
    expect(debVersion('1.0.9')).toBe('1.0.9')
  })

  it('names the artifacts after the app version, not a separate counter', () => {
    expect(debFileName('1.0.9')).toBe('45flow-web_1.0.9_all.deb')
    expect(rpmFileName('1.0.9')).toBe('45flow-web-1.0.9-1.noarch.rpm')
    expect(tarFileName('1.0.9')).toBe('45flow-web-1.0.9.tar.gz')
  })
})

describe('version.json', () => {
  it('records what is deployed, and marks a build from uncommitted changes', () => {
    expect(versionInfo({ version: '1.0.9', commit: 'abc1234', dirty: false, buildDate: '2026-11-04T00:00:00.000Z' }))
      .toEqual({ name: '45flow-web', version: '1.0.9', commit: 'abc1234', buildDate: '2026-11-04T00:00:00.000Z' })
    expect(versionInfo({ version: '1.0.9', commit: 'abc1234', dirty: true, buildDate: 'x' }).commit).toBe('abc1234-dirty')
    expect(versionInfo({ version: '1.0.9', commit: '', dirty: false, buildDate: 'x' }).commit).toBeNull()
  })
})

describe('package metadata', () => {
  it('writes a deb control file for an architecture-independent package that suggests the broadcaster', () => {
    const control = debControl({ version: '1.2.0-beta.1', maintainer: 'A B <a@b.c>', installedSizeKb: 5784 })

    expect(control).toContain('Package: 45flow-web\n')
    expect(control).toContain('Version: 1.2.0~beta.1\n')
    expect(control).toContain('Architecture: all\n')
    expect(control).toContain('Recommends: houston-broadcaster\n')
    expect(control).not.toMatch(/^Depends:/m)
    expect(control.endsWith('\n')).toBe(true)
  })

  it('writes an rpm spec that installs only under the web root with fixed, non-writable modes', () => {
    const spec = rpmSpec({ version: '1.0.9', maintainer: 'A B <a@b.c>', date: '2026-11-04T12:00:00Z' })

    expect(spec).toContain('Name:           45flow-web')
    expect(spec).toContain('BuildArch:      noarch')
    expect(spec).toContain('%defattr(0644,root,root,0755)')
    expect(spec).toContain(`%files\n%defattr(0644,root,root,0755)\n${WEB_ROOT}\n`)
    expect(spec).toContain('* Wed Nov 04 2026 A B <a@b.c> - 1.0.9-1')
  })

  it('formats the changelog date the way rpm requires', () => {
    expect(rpmChangelogDate('2026-01-05T23:59:59Z')).toBe('Mon Jan 05 2026')
  })
})
