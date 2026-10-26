// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { parseArgs, runProcess, summaryStatus } = require('../test-security-hygiene.cjs')

describe('security hygiene runner', () => {
  it('defaults to the required three Linux backends without shell commands', () => {
    const options = parseArgs([])
    expect(options.scope).toBe('all')
    expect(options.linuxBackends).toEqual(['kwallet5', 'gnome-libsecret', 'basic'])
    expect(options.timeout).toBe(90)
  })
  it('accepts independent desktop/server runs and paths containing spaces', () => {
    expect(parseArgs(['--scope', 'desktop', '--linux-backends', 'basic', '--timeout', '45']).linuxBackends)
      .toEqual(['basic'])
    expect(parseArgs(['--scope', 'server', '--server-repo', '/a path/server repo']).serverRepo)
      .toContain('server repo')
  })
  it.each([
    ['--scope', 'invalid'], ['--linux-backends', 'basic_text'], ['--linux-backends', 'basic,basic'],
    ['--timeout', '0'], ['--timeout', 'NaN'], ['--timeout', '601'], ['--timeout', '30.5'],
    ['--unknown', 'value'], ['--scope'],
  ])('rejects invalid or ambiguous arguments %j', (...args) => {
    expect(() => parseArgs(args)).toThrow()
  })
  it('supports help without loading native dependencies', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true })
  })
  it('never treats blocked prerequisites as passing or hides a failure behind a block', () => {
    expect(summaryStatus([{ status: 'pass' }])).toBe('pass')
    expect(summaryStatus([{ status: 'pass' }, { status: 'blocked' }])).toBe('blocked')
    expect(summaryStatus([{ status: 'blocked' }, { status: 'fail' }])).toBe('fail')
    expect(summaryStatus([])).toBe('fail')
    expect(summaryStatus([{ status: 'unknown' }])).toBe('fail')
  })
  it('uses literal arguments rather than interpolating them into a shell', async () => {
    const literal = 'value with spaces; $(not-a-command) & characters'
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe(literal)
  })
  it('surfaces launch failures and bounds helper lifetimes', async () => {
    const missing = await runProcess('45flow-qa-definitely-missing-executable', [])
    expect(missing.launchError).toBe(true)
    const timeout = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 })
    expect(timeout.timedOut).toBe(true)
    expect(timeout.code).not.toBe(0)
  })
  it('terminates only its own helper process tree on timeout', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-hygiene-timeout-test-'))
    const marker = path.join(directory, 'orphan-marker')
    try {
      const childScript = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), 600)`
      const parentScript = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], {stdio:'ignore'}); setInterval(() => {}, 1000)`
      const result = await runProcess(process.execPath, ['-e', parentScript], { timeout: 200 })
      expect(result.timedOut).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 800))
      expect(fs.existsSync(marker)).toBe(false)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
