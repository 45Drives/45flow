import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disableNotifications, enableNotifications, notificationPermission, notificationsEnabled, notifyIfHidden } from './web-notify'

let shown
let hidden

beforeEach(() => {
  localStorage.clear()
  shown = []
  hidden = true
  class FakeNotification {
    static permission = 'default'
    static requestPermission = vi.fn(async () => { FakeNotification.permission = 'granted'; return 'granted' })
    constructor(title, options) { shown.push({ title, ...options }) }
  }
  vi.stubGlobal('Notification', FakeNotification)
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
})
afterEach(() => vi.unstubAllGlobals())

describe('browser notifications', () => {
  it('never asks for permission on its own, and stays quiet until the user opts in', () => {
    expect(notificationsEnabled()).toBe(false)
    expect(notifyIfHidden('Upload complete', 'clip.mp4')).toBe(false)
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(shown).toEqual([])
  })

  it('asks once, when the user turns it on, and then notifies while the tab is hidden', async () => {
    await expect(enableNotifications()).resolves.toBe('granted')

    expect(notificationsEnabled()).toBe(true)
    expect(notifyIfHidden('Upload complete', 'clip.mp4', 'task-1')).toBe(true)
    expect(shown[0]).toMatchObject({ title: 'Upload complete', body: 'clip.mp4', tag: 'task-1' })
  })

  it('does not interrupt someone who is looking at the page', async () => {
    await enableNotifications()
    hidden = false

    expect(notifyIfHidden('Upload complete', 'clip.mp4')).toBe(false)
    expect(shown).toEqual([])
  })

  it('respects turning it off, and a blocked permission', async () => {
    await enableNotifications()
    disableNotifications()
    expect(notificationsEnabled()).toBe(false)

    localStorage.clear()
    Notification.permission = 'denied'
    await expect(enableNotifications()).resolves.toBe('denied')
    expect(notificationsEnabled()).toBe(false)
  })

  it('reports an unsupported browser without throwing', async () => {
    vi.stubGlobal('Notification', undefined)

    expect(notificationPermission()).toBe('unsupported')
    await expect(enableNotifications()).resolves.toBe('unsupported')
    expect(notifyIfHidden('x', 'y')).toBe(false)
  })
})
