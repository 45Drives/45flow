// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { releaseWebPackages } from './web-workflow.mjs'

const sourceSha = 'a'.repeat(40)
const options = { repo: '45Drives/45flow', workflowRef: 'release-branch', sourceSha, version: '1.0.9' }
const ownRun = { databaseId: 12345, displayTitle: '45flow-web:request-1' }
const root = fileURLToPath(new URL('../..', import.meta.url))
let work

afterEach(() => {
  if (work) fs.rmSync(work, { recursive: true, force: true })
  work = undefined
})

function commands({ lists = [[ownRun]], conclusion = 'success', watchError } = {}) {
  let index = 0
  return vi.fn((_command, args) => {
    if (args[0] === 'repo') return 'main\n'
    if (args[0] === 'workflow') return ''
    if (args[1] === 'list') return JSON.stringify(lists[Math.min(index++, lists.length - 1)])
    if (args[1] === 'watch') {
      if (watchError) throw watchError
      return ''
    }
    if (args[1] === 'view') return JSON.stringify({ status: 'completed', conclusion })
    throw new Error(`Unexpected command: ${args.join(' ')}`)
  })
}

describe('orchestrated web package releases', () => {
  it('pins source/version, watches only its own run and waits for publication', async () => {
    const run = commands({ lists: [[{ ...ownRun, displayTitle: '45flow-web:other-request' }], [ownRun]] })
    const sleep = vi.fn()
    await expect(releaseWebPackages(options, { run, sleep, requestId: 'request-1' })).resolves.toBe('12345')
    expect(run).toHaveBeenCalledWith('gh', [
      'workflow', 'run', 'build-web-packages.yml', '--repo', options.repo, '--ref', 'release-branch',
      '-f', `source_sha=${sourceSha}`, '-f', 'expected_version=1.0.9', '-f', 'request_id=request-1',
    ])
    expect(sleep).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith('gh', [
      'run', 'watch', '12345', '--repo', options.repo, '--exit-status', '--interval', '15',
    ], { stdio: 'inherit', timeout: 7200000 })
    expect(run.mock.calls.at(-1)[1]).toEqual(['run', 'view', '12345', '--repo', options.repo, '--json', 'status,conclusion'])
  })

  it('uses the default branch for workflow code when no override is set', async () => {
    const run = commands()
    await releaseWebPackages({ ...options, workflowRef: undefined }, { run, requestId: 'request-1' })
    expect(run).toHaveBeenCalledWith('gh', ['repo', 'view', options.repo, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])
    expect(run.mock.calls.find(([, args]) => args[0] === 'workflow')[1]).toContain('main')
  })

  it.each(['failure', 'cancelled', 'timed_out', 'skipped'])('blocks release on %s', async (conclusion) => {
    const run = commands({ conclusion })
    await expect(releaseWebPackages(options, { run, requestId: 'request-1' })).rejects.toThrow(`completed/${conclusion}`)
  })

  it('propagates watch failure or timeout without claiming success', async () => {
    const run = commands({ watchError: new Error('workflow failed') })
    await expect(releaseWebPackages(options, { run, requestId: 'request-1' })).rejects.toThrow('workflow failed')
    expect(run.mock.calls.some(([, args]) => args[1] === 'view')).toBe(false)
  })

  it('fails boundedly rather than watching another concurrent release', async () => {
    const run = commands({ lists: [[{ ...ownRun, displayTitle: '45flow-web:other-request' }]] })
    const sleep = vi.fn()
    await expect(releaseWebPackages(options, { run, sleep, attempts: 3, requestId: 'request-1' }))
      .rejects.toThrow('dispatch was not found')
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(run.mock.calls.some(([, args]) => args[1] === 'watch')).toBe(false)
  })

  it('propagates dispatch/auth errors without polling', async () => {
    const run = vi.fn(() => { throw new Error('workflow not available') })
    await expect(releaseWebPackages(options, { run })).rejects.toThrow('workflow not available')
    expect(run).toHaveBeenCalledOnce()
  })

  it.each([
    { sourceSha: 'main' }, { version: 'latest' }, { repo: '' },
  ])('rejects invalid release identity before dispatch: %j', async (invalid) => {
    const run = vi.fn()
    await expect(releaseWebPackages({ ...options, ...invalid }, { run })).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })

  it('integrates after Windows stage-only exits and before GitHub release mutations', () => {
    const script = fs.readFileSync(new URL('./orchestrate-release.sh', import.meta.url), 'utf8')
    const call = script.indexOf('node "$ROOT_DIR/scripts/release/web-workflow.mjs"')
    const builds = script.indexOf('# Execute builds')
    expect(call).toBeGreaterThan(builds)
    expect(script.lastIndexOf('exit 0', call)).toBeGreaterThan(builds)
    expect(call).toBeLessThan(script.indexOf('\ngenerate_update_metadata\n'))
    expect(call).toBeLessThan(script.indexOf('gh release create'))
    expect(call).toBeLessThan(script.indexOf('gh release upload'))
    expect(call).toBeLessThan(script.indexOf('gh release edit'))
    expect(script).toContain('RELEASE_SOURCE_SHA="$(git rev-parse HEAD)"')
  })

  it('has a dispatch-only workflow that verifies the source and syncs repos without publishing GitHub releases', () => {
    const workflow = fs.readFileSync(new URL('../../.github/workflows/build-web-packages.yml', import.meta.url), 'utf8')
    expect(workflow).toContain("run-name: '45flow-web:${{ inputs.request_id }}'")
    expect(workflow).toContain('ref: ${{ inputs.source_sha }}')
    expect(workflow).toContain('sh scripts/web/ci-prepare.sh "$SOURCE_SHA" "$EXPECTED_VERSION"')
    // The package runner has no node; no workflow step may depend on it.
    expect(workflow).not.toMatch(/^\s+(run:\s*)?.*\bnode\b/m)
    expect(workflow).toContain('45drives/actions/sync-repo@main')
    expect(workflow).not.toContain('create_release:')
    expect(workflow).not.toContain('action-gh-release')
    expect(workflow).not.toMatch(/^\s+push:/m)
    expect(workflow).not.toContain("startsWith(github.ref, 'refs/tags/')")
  })
})

describe('real orchestrator with simulated GitHub commands', () => {
  function orchestrate(failure = false, overrides = {}) {
    work = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-release-sync-'))
    const bin = path.join(work, 'bin')
    fs.mkdirSync(bin)
    const mock = path.join(bin, 'mock')
    fs.writeFileSync(mock, `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const name = path.basename(process.argv[1]), args = process.argv.slice(2)
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify([name, ...args]) + '\\n')
if (name === 'git') {
  if (args[0] === 'rev-parse') console.log('${sourceSha}')
  if (args[0] === 'status' && process.env.MOCK_DIRTY === '1') console.log(' M src/renderer/main.ts')
} else if (name === 'gh') {
  if (args[0] === 'workflow') {
    fs.writeFileSync(process.env.MOCK_REQUEST, args.find(a => a.startsWith('request_id=')).slice(11))
  } else if (args[1] === 'list') {
    console.log(JSON.stringify([{databaseId: 12345, displayTitle: '45flow-web:' + fs.readFileSync(process.env.MOCK_REQUEST, 'utf8')}]))
  } else if (args[1] === 'watch') {
    if (process.env.MOCK_WEB_FAIL === '1') process.exit(1)
  } else if (args[1] === 'view') {
    console.log(JSON.stringify({status:'completed', conclusion:'success'}))
  } else { console.error('Unexpected GitHub mutation: ' + args.join(' ')); process.exit(2) }
}
`, { mode: 0o755 })
    for (const command of ['git', 'gh', 'yarn', 'ssh', 'scp', 'rsync']) {
      fs.symlinkSync(mock, path.join(bin, command))
    }
    const envFile = path.join(work, 'orchestrator.env')
    if (overrides.MOCK_STAGED_SHA) {
      fs.mkdirSync(path.join(work, 'staging'))
      fs.writeFileSync(path.join(work, 'staging', 'source-commit'), `${overrides.MOCK_STAGED_SHA}\n`)
    }
    fs.writeFileSync(envFile, [
      'RUN_LINUX_BUILD=0', 'RUN_MAC_BUILD=0', 'RUN_WINDOWS_BUILD=0',
      'GH_CREATE_DRAFT=0', `GH_UPLOAD_RELEASE=${failure ? 1 : 0}`, 'GH_PUBLISH_RELEASE=0',
      'WEB_WORKFLOW_REF=release-branch',
      `RELEASE_STAGING_DIR=${work}/staging`, `RELEASE_BUILDS_DIR=${work}/staging`,
    ].join('\n'))
    const log = path.join(work, 'commands.jsonl')
    let output, error
    try {
      output = execFileSync('bash', ['scripts/release/orchestrate-release.sh', '--env-file', envFile], {
        cwd: root, encoding: 'utf8', stdio: 'pipe',
        env: {
          ...process.env, PATH: `${bin}:${process.env.PATH}`,
          MOCK_LOG: log, MOCK_REQUEST: path.join(work, 'request'), MOCK_WEB_FAIL: failure ? '1' : '0',
          ...overrides,
        },
      })
    } catch (e) { error = e }
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []
    return { output, error, calls }
  }

  it('runs the web build/publication even when all desktop builders and GitHub publishing are disabled', () => {
    const { output, error, calls } = orchestrate()
    expect(error).toBeUndefined()
    expect(output).toContain('built, signed and synchronized to package repositories')
    expect(output).toContain('Release orchestration complete.')
    expect(calls.some(([command, ...args]) => command === 'gh' && args[0] === 'workflow' && args.includes(`source_sha=${sourceSha}`))).toBe(true)
    expect(calls.some(([command, ...args]) => command === 'gh' && args[0] === 'release')).toBe(false)
  })

  it('exits nonzero on web publication failure before any tag or GitHub release mutation', () => {
    const { error, calls } = orchestrate(true)
    expect(error?.status).toBe(1)
    expect(calls.some(([command, ...args]) => command === 'gh' && args[1] === 'watch')).toBe(true)
    expect(calls.some(([command, ...args]) => command === 'gh' && args[0] === 'release')).toBe(false)
    expect(calls.some(([command, ...args]) => command === 'git' && ['tag', 'push'].includes(args[0]))).toBe(false)
  })

  it('refuses dirty desktop sources before dispatching any web package publication', () => {
    const { error, calls } = orchestrate(false, { MOCK_DIRTY: '1' })
    expect(error?.status).toBe(1)
    expect(String(error?.stderr)).toContain('Desktop release source changed or is dirty')
    expect(calls.some(([command]) => command === 'gh')).toBe(false)
  })

  it('refuses Windows finalize without the source record from its stage run', () => {
    const { error, calls } = orchestrate(false, { RUN_WINDOWS_BUILD: '1', WIN_PHASE: 'finalize' })
    expect(error?.status).toBe(1)
    expect(String(error?.stderr)).toContain('Windows finalize requires a source-commit record')
    expect(calls.some(([command]) => command === 'gh')).toBe(false)
  })

  it('refuses macOS sign-only without a matching build source record', () => {
    const { error, calls } = orchestrate(false, { RUN_MAC_BUILD: '1', MAC_PHASE: 'sign' })
    expect(error?.status).toBe(1)
    expect(String(error?.stderr)).toContain('macOS sign-only requires a source-commit record')
    expect(calls.some(([command]) => command === 'gh')).toBe(false)
  })

  it('rejects staged artifacts from another commit before dispatching', () => {
    const { error, calls } = orchestrate(false, { MOCK_STAGED_SHA: 'b'.repeat(40) })
    expect(error?.status).toBe(1)
    expect(String(error?.stderr)).toContain('Staged desktop artifacts belong to a different source commit')
    expect(calls.some(([command]) => command === 'gh')).toBe(false)
  })
})
