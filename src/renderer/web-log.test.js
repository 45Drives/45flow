import { describe, expect, it } from 'vitest'
import { captureGlobalErrors, createWebLog, sanitize } from './web-log'

const memoryStorage = () => {
  const data = new Map()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
}

describe('sanitize', () => {
  it('redacts secrets at any depth and truncates long strings', () => {
    const out = sanitize({ user: 'root', password: 'p', nested: { Authorization: 'Bearer x', ok: 1 }, long: 'x'.repeat(2000) })

    expect(out.password).toBe('[redacted]')
    expect(out.nested).toEqual({ Authorization: '[redacted]', ok: 1 })
    expect(out.long.length).toBeLessThan(600)
  })

  it('survives cycles and keeps useful error details', () => {
    const loop = { name: 'a' }
    loop.self = loop

    expect(sanitize(loop).self).toBe('[truncated]')
    expect(sanitize(new Error('boom'))).toMatchObject({ name: 'Error', message: 'boom' })
  })
})

describe('web log', () => {
  it('returns newest first in the shape the Log Viewer expects', () => {
    const log = createWebLog(memoryStorage())

    log.info('one')
    log.warn('two', { message: 'careful' })

    const { entries, ok } = log.read()
    expect(ok).toBe(true)
    expect(entries.map((e) => e.event)).toEqual(['two', 'one'])
    expect(entries[0]).toMatchObject({ level: 'warn', summary: 'careful', timestamp: expect.any(String), id: expect.any(String) })
  })

  it('keeps only the most recent 500 entries', () => {
    const log = createWebLog(memoryStorage())

    for (let i = 0; i < 520; i++) log.info(`event.${i}`)

    const { entries } = log.read(1000)
    expect(entries).toHaveLength(500)
    expect(entries[0].event).toBe('event.519')
    expect(entries.at(-1).event).toBe('event.20')
  })

  it('survives a reload within the tab, and clears on request', () => {
    const storage = memoryStorage()
    createWebLog(storage).error('before.reload', { message: 'it broke' })

    const reloaded = createWebLog(storage)
    expect(reloaded.read().entries[0].event).toBe('before.reload')

    reloaded.clear()
    expect(createWebLog(storage).read().entries).toEqual([])
  })

  it('exports one JSON object per line, oldest first', () => {
    const log = createWebLog(memoryStorage())
    log.info('a')
    log.info('b')

    expect(log.exportText().split('\n').map((line) => JSON.parse(line).event)).toEqual(['a', 'b'])
  })

  it('keeps working when storage is unavailable', () => {
    const log = createWebLog({ getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })

    log.info('still.works')

    expect(log.read().entries).toHaveLength(1)
  })
})

describe('global error capture', () => {
  it('records uncaught errors and unhandled rejections', () => {
    const log = createWebLog(memoryStorage())
    const target = new EventTarget()
    captureGlobalErrors(log, target)

    target.dispatchEvent(Object.assign(new Event('error'), { message: 'x is not defined', filename: 'app.js', lineno: 3, error: new Error('x is not defined') }))
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') }))

    const events = log.read().entries.map((e) => e.event)
    expect(events).toEqual(['window.unhandledrejection', 'window.error'])
  })
})
