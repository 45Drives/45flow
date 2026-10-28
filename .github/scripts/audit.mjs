#!/usr/bin/env node
// Runs the Yarn audit, ignoring only unexpired advisories listed in .github/audit-exceptions.json.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const file = new URL('../audit-exceptions.json', import.meta.url)
const { exceptions = [] } = JSON.parse(readFileSync(file, 'utf8'))
const today = new Date().toISOString().slice(0, 10)
const ignores = []
let invalid = false

for (const entry of exceptions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '') || !entry.reason || !entry.advisories?.length) {
    console.error(`::error::Audit exception for ${entry.package} needs a reason, advisories and an expires date (YYYY-MM-DD).`)
    invalid = true
  } else if (today > entry.expires) {
    console.error(`::error::Audit exception for ${entry.package} expired on ${entry.expires}. Fix the advisories or renew the exception.`)
    invalid = true
  } else {
    console.log(`Ignoring ${entry.advisories.length} ${entry.package} advisories until ${entry.expires}: ${entry.reason}`)
    for (const { id } of entry.advisories) ignores.push('--ignore', String(id))
  }
}
if (invalid) process.exit(1)

const result = spawnSync('yarn', ['npm', 'audit', '--all', '--recursive', '--severity', 'high', ...ignores], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
