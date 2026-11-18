import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computePosition } from '@floating-ui/dom'
import GuidedTour from './GuidedTour.vue'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn(),
  autoUpdate: (_el, _popup, update) => { void update(); return () => {} },
  offset: vi.fn(),
  flip: vi.fn(),
  shift: vi.fn(),
}))

let app
let host
let done, skip, unavailable
let steps
const position = { x: 8, y: 12, placement: 'bottom' }
const visible = () => document.querySelectorAll('[data-flow-tour]').length === 2
const button = name => [...document.querySelectorAll('[data-flow-tour] button')]
  .find(el => el.textContent.trim() === name)

function target(id, hidden = false) {
  const el = document.createElement('div')
  el.id = id
  el.style.visibility = hidden ? 'hidden' : 'visible'
  el.getBoundingClientRect = () => ({ x: 0, y: 0, width: 100, height: 20 })
  el.scrollIntoView = vi.fn()
  host.append(el)
  return el
}

function mount(items) {
  steps = ref(items)
  app.mount(document.createElement('div'))
}

beforeEach(() => {
  vi.useFakeTimers()
  computePosition.mockReset().mockResolvedValue(position)
  done = vi.fn()
  skip = vi.fn()
  unavailable = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(GuidedTour, {
    active: true, steps: steps.value, onDone: done, onSkip: skip, onUnavailable: unavailable,
  }) })
})

afterEach(() => {
  app.unmount()
  host.remove()
  vi.useRealTimers()
})

describe('GuidedTour', () => {
  it('waits for a late hidden-to-visible target after Next and lets users go back', async () => {
    target('first')
    const late = target('late', true)
    mount([{ target: '#first', message: 'First' }, { target: '#late', message: 'Late' }])
    await vi.advanceTimersByTimeAsync(30)
    button('Next').click()
    await vi.advanceTimersByTimeAsync(300)
    expect(visible()).toBe(false)
    late.style.visibility = 'visible'
    await vi.advanceTimersByTimeAsync(30)
    expect(visible()).toBe(true)
    expect(button('Finish')).toBe(document.activeElement)
    button('Back').click()
    await vi.advanceTimersByTimeAsync(30)
    expect(button('Back')).toBeUndefined()
    expect(button('Next')).toBe(document.activeElement)
    expect(done).not.toHaveBeenCalled()
  })

  it('cleans up a missing prepared step before advancing and only cleans entered steps', async () => {
    const beforeShow = vi.fn()
    const cleanup = vi.fn()
    const unenteredCleanup = vi.fn()
    target('second')
    mount([
      { target: '#missing', message: 'Missing', beforeShow, cleanup },
      { target: '#second', message: 'Second' },
      { target: '#third', message: 'Third', cleanup: unenteredCleanup },
    ])
    await vi.advanceTimersByTimeAsync(2050)
    expect(beforeShow).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(visible()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(skip).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(unenteredCleanup).not.toHaveBeenCalled()
  })

  it('reports an entirely missing tour without recording completion', async () => {
    mount([{ target: '#missing', message: 'Missing' }])
    await vi.advanceTimersByTimeAsync(2050)
    expect(unavailable).toHaveBeenCalledOnce()
    expect(done).not.toHaveBeenCalled()
    expect(skip).not.toHaveBeenCalled()
  })

  it('cleans up the replaced step and ignores its pending position result', async () => {
    const cleanup = vi.fn()
    let resolveOld
    computePosition.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    target('old')
    mount([{ target: '#old', message: 'Old', cleanup }])
    await vi.advanceTimersByTimeAsync(30)
    steps.value = [{ target: '#missing', message: 'New' }]
    await nextTick()
    resolveOld(position)
    await vi.advanceTimersByTimeAsync(30)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(visible()).toBe(false)
  })
})
