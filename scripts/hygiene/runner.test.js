// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { parseArgs, runProcess, summaryStatus, sanitizeDiagnostic, nativeDiagnostics } = require('../test-security-hygiene.cjs')

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
    expect(missing.launchErrorCode).toBe('ENOENT')
    const timeout = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 })
    expect(timeout.timedOut).toBe(true)
    expect(timeout.code).not.toBe(0)
  })
  it('retains startup failure evidence without revealing synthetic secrets or user paths', () => {
    const secret = 'synthetic-canary-value'
    const result = nativeDiagnostics({
      code: null, signal: 'SIGABRT', timedOut: false, launchErrorCode: null,
      stderr: `\x1b[31mdyld: /Users/qauser/library failed at /private/qa-temp/app: qa-token-${secret}\x1b[0m`,
      stdout: `qa-password-${secret}`,
    }, { stage: 'Loading production credential store', electron: '38.2.2', architecture: 'arm64',
      error: `Cannot load /private/qa-temp/store: ${secret}` },
    { secret, temporary: '/private/qa-temp', home: '/Users/qauser' })
    expect(result.signal).toBe('SIGABRT')
    expect(result.lastStage).toBe('Loading production credential store')
    expect(result.electronArchitecture).toBe('arm64')
    const encoded = JSON.stringify(result)
    expect(encoded).not.toContain(secret)
    expect(encoded).not.toContain('/Users/qauser')
    expect(encoded).not.toContain('/private/qa-temp')
    expect(result.stderr).toContain('dyld:')
    expect(result.stderr).not.toContain('\x1b')
    expect(result.stdout).toBe('qa-password-[REDACTED_QA_SECRET]')
  })
  it('identifies crashes before the JS entry point and bounds diagnostic output', () => {
    expect(nativeDiagnostics({ code: 1, stderr: 'startup failure' }, null, {}).lastStage)
      .toBe('Before the Electron QA entry point')
    expect(sanitizeDiagnostic('a'.repeat(20000))).toHaveLength(8192)
  })
  it('records an actual bootstrap import failure before application readiness', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-hygiene-bootstrap-test-'))
    try {
      const config = {
        startupFile: path.join(directory, 'startup.json'), result: path.join(directory, 'result.json'),
        phase: 'seed',
      }
      const configPath = path.join(directory, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify(config))
      // Node can load Electron's package path, but the unbundled helper has no store.cjs.
      // This deliberately exercises an early import failure, not native encryption.
      const helper = fileURLToPath(new URL('./electron.cjs', import.meta.url))
      const execution = await runProcess(process.execPath, [helper], {
        env: { ...process.env, HYGIENE_QA_CONFIG: configPath }, timeout: 5000,
      })
      expect(execution.code).toBe(1)
      const startup = JSON.parse(fs.readFileSync(config.startupFile, 'utf8'))
      expect(startup.stage).toBe('Loading production credential store')
      expect(startup.error).toContain('store.cjs')
      const result = JSON.parse(fs.readFileSync(config.result, 'utf8'))
      expect(result.status).toBe('fail')
      expect(result.failedCheck).toBe('Loading production credential store')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
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
