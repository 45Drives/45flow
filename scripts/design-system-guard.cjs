#!/usr/bin/env node
// Design-system guard: fails when screens drift back to one-off styling.
//   node scripts/design-system-guard.cjs        (or: yarn check:ui)
// Rules and replacements are documented in docs/design-system.md.
// Escape hatch for a deliberate exception: put `flow-ui-allow: <reason>` in a comment
// on the offending line, or in an HTML comment on the line directly above it.

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const SCAN_DIRS = ['src']
const EXEMPT_DIRS = [path.join('src', 'renderer', 'ui') + path.sep]

const TONES_ALL = 'red|rose|pink|amber|yellow|orange|green|emerald|lime|teal|cyan|sky|blue'
const TONES_TEXT = 'red|rose|pink|amber|yellow|orange|green|emerald|lime'

const LINE_RULES = [
  {
    id: 'no-btn-delete',
    pattern: /\bbtn-delete\b/,
    message: 'btn-delete is gone; use btn-danger (or <FlowButton variant="danger">).',
  },
  {
    id: 'no-ss-chip',
    pattern: /\bss-chip\b/,
    message: 'ss-chip is gone; use <FlowChip tone="…"> or flow-chip flow-chip--<tone>.',
  },
  {
    id: 'no-numeric-z',
    pattern: /(^|[\s"'`:])z-\[\d+\]/,
    message: 'Use a named layer (z-header, z-dropdown, z-overlay, z-modal, z-popover, z-tour, z-critical), not z-[N].',
  },
  {
    id: 'no-raw-tone-surface',
    pattern: new RegExp(`(^|[\\s"'\`:])(bg|border|from|via|to)-(${TONES_ALL})-\\d{2,3}\\b`),
    message: 'Raw status colour; use <FlowNotice>, <FlowChip>, flow-tone-<tone>, flow-dot--<tone> or bg-primary.',
  },
  {
    id: 'no-houston-status-text',
    pattern: /(^|[\s"'`:])(text|border)-(danger|success|warning)(?![\w-])/,
    message: 'Use text-flow-<tone> / border-flow-<tone> so status colours match notices and chips.',
  },
  {
    id: 'no-raw-tone-text',
    pattern: new RegExp(`(^|[\\s"'\`:])text-(${TONES_TEXT})-\\d{2,3}\\b`),
    message: 'Raw status text colour; use text-flow-danger / -warning / -success / -info.',
  },
]

// A bare "Back" can mean "previous wizard step" (secondary), so only "Back to …" is enforced.
const DISMISS_LABEL = /^(Close|Cancel|Back to [A-Za-z ]+|Log ?[Oo]ut|Sign out|Not now|Dismiss)$/

function listVueFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...listVueFiles(full))
    } else if (entry.name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

function templateRange(source) {
  const start = source.indexOf('<template')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1) return null
  return [start, end]
}

function lineOf(source, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

function isAllowed(lines, lineNo) {
  const current = lines[lineNo - 1] || ''
  const previous = lines[lineNo - 2] || ''
  return current.includes('flow-ui-allow') || /<!--\s*flow-ui-allow/.test(previous)
}

function checkSource(source, file = '<inline>') {
  const range = templateRange(source)
  if (!range) return []
  const lines = source.split('\n')
  const firstLine = lineOf(source, range[0])
  const lastLine = lineOf(source, range[1])
  const violations = []
  const report = (line, id, message) => {
    if (!isAllowed(lines, line)) violations.push({ file, line, rule: id, message })
  }

  for (let n = firstLine; n <= lastLine; n++) {
    const text = lines[n - 1]
    for (const rule of LINE_RULES) {
      if (rule.pattern.test(text)) report(n, rule.id, rule.message)
    }
  }

  const template = source.slice(range[0], range[1])
  const offset = range[0]

  // Full-screen fixed layers must be FlowModal, or be marked as a non-modal overlay.
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*?)>/gs
  for (const match of template.matchAll(tagRe)) {
    const attrs = match[2]
    const classAttr = attrs.match(/\bclass\s*=\s*"([^"]*)"/s)
    if (!classAttr) continue
    const classes = classAttr[1].split(/\s+/)
    if (classes.includes('fixed') && classes.includes('inset-0') && !/\bdata-flow-overlay\b/.test(attrs)) {
      report(lineOf(source, offset + match.index), 'use-flow-modal',
        'Full-screen fixed layer: use <FlowModal>; mark deliberate non-modal overlays with data-flow-overlay.')
    }
  }

  // Close / Cancel / Back buttons are "dismiss" actions.
  const buttonRe = /<(button|FlowButton)\b([^>]*)>\s*([^<]*?)\s*<\/\1>/gs
  for (const match of template.matchAll(buttonRe)) {
    const [, tag, attrs, label] = match
    if (!DISMISS_LABEL.test(label.trim())) continue
    const ok = tag === 'FlowButton' ? /\bvariant\s*=\s*"dismiss"/.test(attrs) : /\bbtn-dismiss\b/.test(attrs)
    const styled = tag === 'FlowButton' || /\bbtn\b/.test(attrs)
    if (styled && !ok) {
      report(lineOf(source, offset + match.index), 'dismiss-variant',
        `"${label.trim()}" leaves without changing anything; use btn-dismiss (or <FlowButton variant="dismiss">).`)
    }
  }

  return violations
}

function scan(baseDir = root) {
  const violations = []
  for (const dir of SCAN_DIRS) {
    const abs = path.join(baseDir, dir)
    if (!fs.existsSync(abs)) continue
    for (const file of listVueFiles(abs)) {
      const rel = path.relative(baseDir, file)
      if (EXEMPT_DIRS.some((exempt) => rel.startsWith(exempt))) continue
      violations.push(...checkSource(fs.readFileSync(file, 'utf8'), rel))
    }
  }
  return violations
}

module.exports = { checkSource, scan }

if (require.main === module) {
  const violations = scan()
  for (const v of violations) console.log(`${v.file}:${v.line}  [${v.rule}] ${v.message}`)
  if (violations.length) {
    console.error(`\n${violations.length} design-system violation(s). See docs/design-system.md.`)
    process.exit(1)
  }
  console.log('Design-system guard: clean.')
}
