import fs from 'node:fs'
import { packageManifest } from './lib.mjs'

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const file = new URL('../../manifest.json', import.meta.url)
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
fs.writeFileSync(file, `${JSON.stringify(packageManifest(pkg, manifest), null, 2)}\n`)
