// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { checkSource, scan } = require('./design-system-guard.cjs')

const rules = (template) => checkSource(`<template>\n${template}\n</template>`).map((v) => v.rule)

describe('design-system guard rules', () => {
  it('flags the drift patterns the design system replaces', () => {
    expect(rules('<button class="btn btn-delete">Delete</button>')).toContain('no-btn-delete')
    expect(rules('<span class="ss-chip ss-chip--success">Live</span>')).toContain('no-ss-chip')
    expect(rules('<div class="fixed inset-0 z-50 bg-black/50"></div>')).toContain('use-flow-modal')
    expect(rules('<div class="absolute z-[2200]"></div>')).toContain('no-numeric-z')
    expect(rules('<div class="bg-amber-50 border border-amber-300 p-2">Careful</div>')).toContain('no-raw-tone-surface')
    expect(rules('<p class="text-red-500 text-xs">Bad</p>')).toContain('no-raw-tone-text')
    expect(rules('<p class="dark:text-red-400">Bad</p>')).toContain('no-raw-tone-text')
    expect(rules('<p class="text-danger">Bad</p>')).toContain('no-houston-status-text')
    expect(rules('<button class="btn btn-danger" @click="close">Close</button>')).toContain('dismiss-variant')
    expect(rules('<button class="btn btn-secondary">\n  Back to Project\n</button>')).toContain('dismiss-variant')
    expect(rules('<FlowButton variant="secondary">Cancel</FlowButton>')).toContain('dismiss-variant')
  })

  it('accepts the design-system equivalents and marked exceptions', () => {
    expect(rules('<button class="btn btn-dismiss" @click="close">Close</button>')).toEqual([])
    expect(rules('<FlowButton variant="dismiss">Cancel</FlowButton>')).toEqual([])
    expect(rules('<button class="btn btn-danger">Delete</button>')).toEqual([])
    expect(rules('<div class="fixed inset-0 z-tour" data-flow-overlay></div>')).toEqual([])
    expect(rules('<span class="text-blue-500 hover:underline">Copy</span>')).toEqual([])
    expect(rules('<p class="text-flow-danger">Bad</p>')).toEqual([])
    expect(rules('<!-- flow-ui-allow: watermark preview swatch -->\n<div class="bg-red-500"></div>')).toEqual([])
    expect(rules('<button class="text-xs underline">Cancel</button>')).toEqual([])
  })

  it('reports file and line', () => {
    const [v] = checkSource('<script></script>\n<template>\n  <div>\n    <i class="bg-red-50" />\n  </div>\n</template>', 'X.vue')
    expect(v).toMatchObject({ file: 'X.vue', line: 4, rule: 'no-raw-tone-surface' })
  })
})

describe('45Flow screens', () => {
  it('follow the design system (yarn check:ui lists violations)', () => {
    const violations = scan().map((v) => `${v.file}:${v.line} [${v.rule}]`)
    expect(violations).toEqual([])
  })
})
