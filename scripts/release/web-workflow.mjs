import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { assertVersion } from '../web/lib.mjs'

const WORKFLOW = 'build-web-packages.yml'
const runCommand = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options,
})

export async function releaseWebPackages({ repo, workflowRef, sourceSha, version }, {
  run = runCommand,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  requestId = randomUUID(),
  attempts = 60,
} = {}) {
  assertVersion(version)
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Web release requires a full source commit SHA')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Web release requires an owner/repository')
  if (!workflowRef) {
    workflowRef = run('gh', ['repo', 'view', repo, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']).trim()
  }
  if (!workflowRef) throw new Error('Cannot resolve the web workflow branch')

  run('gh', ['workflow', 'run', WORKFLOW, '--repo', repo, '--ref', workflowRef,
    '-f', `source_sha=${sourceSha}`, '-f', `expected_version=${version}`, '-f', `request_id=${requestId}`])

  let runId
  for (let attempt = 0; attempt < attempts; attempt++) {
    // REST rather than `gh run list --event/--json displayTitle`, which distro gh builds (e.g. 2.4) lack.
    const runs = JSON.parse(run('gh', ['api',
      `repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100`,
      '--jq', '[.workflow_runs[] | {databaseId: .id, displayTitle: .display_title}]']))
    const matches = runs.filter((item) => item.displayTitle === `45flow-web:${requestId}`)
    if (matches.length > 1) throw new Error('Multiple web workflow runs matched this release request')
    if (matches.length === 1) {
      runId = String(matches[0].databaseId)
      if (!/^\d+$/.test(runId)) throw new Error('Invalid web workflow run ID')
      break
    }
    if (attempt + 1 < attempts) await sleep(2000)
  }
  if (!runId) throw new Error(`Web workflow dispatch was not found; request ${requestId}. Check GitHub Actions before retrying.`)

  console.log(`Waiting for signed 45flow-web ${version}: https://github.com/${repo}/actions/runs/${runId}`)
  run('gh', ['run', 'watch', runId, '--repo', repo, '--exit-status', '--interval', '15'],
    { stdio: 'inherit', timeout: 2 * 60 * 60 * 1000 })
  // Verify the terminal state explicitly, including runs already completed at watch time.
  const result = JSON.parse(run('gh', ['run', 'view', runId, '--repo', repo, '--json', 'status,conclusion']))
  if (result.status !== 'completed' || result.conclusion !== 'success') {
    throw new Error(`Web package build/publication did not succeed: ${result.status}/${result.conclusion}`)
  }
  console.log(`45flow-web ${version} built, signed and synchronized to package repositories`)
  return runId
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, sourceSha] = process.argv.slice(2)
  const head = runCommand('git', ['rev-parse', 'HEAD']).trim()
  if (head !== sourceSha) throw new Error('Source commit changed during desktop builds; rerun the release from the intended commit')
  if (runCommand('git', ['status', '--porcelain']).trim()) {
    throw new Error('Commit or stash source changes before releasing; web and desktop must use the same clean source')
  }
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  if (pkg.version !== version) throw new Error('App version changed during desktop builds; rerun the release')
  const tagSha = runCommand('git', ['rev-parse', `${process.env.GH_TAG_REF || 'HEAD'}^{commit}`]).trim()
  if (tagSha !== sourceSha) throw new Error('GH_TAG_REF must point to the source commit used for the desktop and web builds')
  await releaseWebPackages({
    repo: process.env.GH_REPO || '45Drives/45flow',
    workflowRef: process.env.WEB_WORKFLOW_REF,
    sourceSha, version,
  })
}
