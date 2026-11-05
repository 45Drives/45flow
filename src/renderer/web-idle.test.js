import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleMonitor } from './web-idle'

const IDLE = 900 // 15 min
let clock
let keepAlive
let checkIdle
let onWarning
let onExpired
let monitor

const advance = (seconds) => { clock += seconds * 1000 }

beforeEach(() => {
  clock = 1_000_000
  keepAlive = vi.fn().mockResolvedValue(true)
  checkIdle = vi.fn()
  onWarning = vi.fn()
  onExpired = vi.fn()
  monitor = createIdleMonitor({ idleSeconds: IDLE, keepAlive, checkIdle, onWarning, onExpired, now: () => clock })
})

describe('keepalive on user activity', () => {
  it('does not ping while the session was touched recently', () => {
    advance(30)
    monitor.userActivity()

    expect(keepAlive).not.toHaveBeenCalled()
  })

  it('pings once a minute at most while the user keeps working', async () => {
    advance(61)
    monitor.userActivity()
    await vi.waitFor(() => expect(keepAlive).toHaveBeenCalledTimes(1))

    advance(10)
    monitor.userActivity()
    monitor.userActivity()
    expect(keepAlive).toHaveBeenCalledTimes(1)

    advance(61)
    monitor.userActivity()
    await vi.waitFor(() => expect(keepAlive).toHaveBeenCalledTimes(2))
  })

  it('counts requests from the app itself as activity', async () => {
    advance(300)
    monitor.apiActivity()
    advance(61)
    monitor.userActivity()
    await vi.waitFor(() => expect(keepAlive).toHaveBeenCalledTimes(1))
    keepAlive.mockClear()

    advance(30)
    monitor.userActivity()
    expect(keepAlive).not.toHaveBeenCalled()
  })

  it('ignores a failed keepalive caused by the network', async () => {
    keepAlive.mockRejectedValue(new Error('offline'))
    advance(61)
    monitor.userActivity()
    await vi.waitFor(() => expect(keepAlive).toHaveBeenCalled())

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('ends the session if the server says it is already gone', async () => {
    keepAlive.mockResolvedValue(false)
    advance(61)
    monitor.userActivity()

    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })
})

describe('warning before expiry', () => {
  it('stays quiet until the last two minutes, without asking the server', async () => {
    advance(IDLE - 130)
    await monitor.tick()

    expect(checkIdle).not.toHaveBeenCalled()
    expect(onWarning).not.toHaveBeenCalled()
  })

  it('verifies with the server inside the window and shows its remaining time', async () => {
    checkIdle.mockResolvedValue({ idleRemainingSeconds: 110 })
    advance(IDLE - 115)

    await monitor.tick()

    expect(checkIdle).toHaveBeenCalledTimes(1)
    expect(onWarning).toHaveBeenLastCalledWith(110)
  })

  it('counts down locally between server checks', async () => {
    checkIdle.mockResolvedValue({ idleRemainingSeconds: 110 })
    advance(IDLE - 110)
    await monitor.tick()
    advance(5)

    await monitor.tick()

    expect(checkIdle).toHaveBeenCalledTimes(1)
    expect(onWarning).toHaveBeenLastCalledWith(105)
  })

  it('hides the warning when another tab kept the session alive', async () => {
    checkIdle.mockResolvedValueOnce({ idleRemainingSeconds: 100 }).mockResolvedValueOnce({ idleRemainingSeconds: 800 })
    advance(IDLE - 100)
    await monitor.tick()
    expect(onWarning).toHaveBeenLastCalledWith(100)

    advance(11)
    await monitor.tick()

    expect(onWarning).toHaveBeenLastCalledWith(null)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('hides the warning when activity arrives from another tab', async () => {
    checkIdle.mockResolvedValue({ idleRemainingSeconds: 90 })
    advance(IDLE - 90)
    await monitor.tick()

    monitor.apiActivity()

    expect(onWarning).toHaveBeenLastCalledWith(null)
  })

  it('"Stay signed in" extends the session and clears the warning', async () => {
    checkIdle.mockResolvedValue({ idleRemainingSeconds: 60 })
    advance(IDLE - 60)
    await monitor.tick()

    await monitor.stay()

    expect(keepAlive).toHaveBeenCalledTimes(1)
    expect(onWarning).toHaveBeenLastCalledWith(null)
    expect(onExpired).not.toHaveBeenCalled()
  })
})

describe('expiry', () => {
  it('signs out once the server confirms the session ended', async () => {
    checkIdle.mockResolvedValue(null)
    advance(IDLE + 1)

    await monitor.tick()
    await monitor.tick()

    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(onWarning).toHaveBeenLastCalledWith(null)
  })

  it('does not sign out on its own clock when the server cannot be reached', async () => {
    checkIdle.mockRejectedValue(new Error('offline'))
    advance(IDLE + 30)

    await monitor.tick()

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('stops all activity after stop()', async () => {
    monitor.stop()
    advance(IDLE + 30)

    await monitor.tick()
    monitor.userActivity()

    expect(checkIdle).not.toHaveBeenCalled()
    expect(keepAlive).not.toHaveBeenCalled()
  })
})

describe('a short idle timeout', () => {
  it('sends keepalives more often than the timeout, not once a minute', async () => {
    const short = createIdleMonitor({ idleSeconds: 45, keepAlive, checkIdle, onWarning, onExpired, now: () => clock })

    advance(16) // just over a third of 45 seconds
    short.userActivity()

    await vi.waitFor(() => expect(keepAlive).toHaveBeenCalledTimes(1))
  })

  it('still waits a full minute when the timeout is long', () => {
    advance(30)
    monitor.userActivity()

    expect(keepAlive).not.toHaveBeenCalled()
  })
})
