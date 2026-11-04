// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const config = require('../electron-builder.json')
const universalRequire = createRequire(require.resolve('@electron/universal'))
const { minimatch } = universalRequire('minimatch')

describe('macOS universal media binaries', () => {
  it.each([
    ['ffmpeg', 'arm64'],
    ['ffmpeg', 'x64'],
    ['ffprobe', 'arm64'],
    ['ffprobe', 'x64'],
  ])('allows the identical %s %s binary without lipo', (binary, arch) => {
    const file = `Contents/Resources/app.asar.unpacked/node_modules/@${binary}-installer/darwin-${arch}/${binary}`
    expect(minimatch(file, config.mac.x64ArchFiles, { matchBase: true })).toBe(true)
  })

  it.each([
    'node_modules/other/native.node',
    'node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
    'node_modules/@ffmpeg-installer/darwin-arm64/other',
    'node_modules/@ffprobe-installer/darwin-x64/ffmpeg',
  ])('does not exempt unrelated native files: %s', (file) => {
    expect(minimatch(`Contents/Resources/app.asar.unpacked/${file}`, config.mac.x64ArchFiles, { matchBase: true })).toBe(false)
  })
})
