// @vitest-environment node
import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

// Execute the consumed CLI, not a second implementation of its orchestration.
// Only external build/process boundaries are simulated: no Vite server, Electron,
// compiler, or product output is started/modified by these regression cases.
function runEntry(entry, failure = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-build-test-'))
  const css = path.join(directory, 'node_modules/@45drives/houston-common-ui/dist/index.css')
  fs.mkdirSync(path.dirname(css), { recursive: true })
  fs.writeFileSync(css, '/* synthetic exported CSS fixture */\n')
  try {
    const execution = spawnSync(process.execPath, ['-e', `
      const Module = require('node:module');
      const fs = require('node:fs');
      const { EventEmitter } = require('node:events');
      const { PassThrough } = require('node:stream');
      const originalLoad = Module._load;
      const failure = ${JSON.stringify(failure)};
      const css = ${JSON.stringify(css)};
      function compiler(command, args, options) {
        console.log('COMPILER', JSON.stringify({command, args, cwd: options.cwd}));
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        setTimeout(() => {
          console.log('COMPILER_FINISHED');
          const code = failure === 'main' ? 2 : 0;
          child.emit('exit', code);
          child.emit('close', code);
        }, 30);
        return child;
      }
      Module._load = function(id, parent, ...rest) {
        if (id === 'fs') return { ...fs, rmSync() {}, cpSync() {} };
        if (id === 'vite') return {
          async build() {
            if (failure === 'renderer') throw new Error('synthetic renderer failure');
            if (!fs.existsSync(css)) throw new Error('exported index.css missing');
            console.log('RENDERER_FINISHED');
          },
          async createServer() {
            if (!fs.existsSync(css)) throw new Error('exported index.css missing');
            return { async listen() {
              console.log('DEV_RENDERER_READY');
              return { config: { server: { port: 18081 } } };
            } };
          },
        };
        if (id === 'child_process') return {
          exec(command, options) { return compiler(command, [], options); },
          spawn(command, args, options) {
            if (command === 'synthetic-electron') {
              console.log('DEV_ELECTRON_READY');
              return { stdout: new PassThrough(), stderr: new PassThrough(), on() {} };
            }
            return compiler(command, args, options);
          },
        };
        if (id === 'electron') return 'synthetic-electron';
        if (id === 'chokidar') return { watch() { return { on() {} }; } };
        return originalLoad.call(this, id, parent, ...rest);
      };
      require(${JSON.stringify(path.join(root, 'scripts', entry))});
    `], { cwd: directory, env: { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0' }, encoding: 'utf8', timeout: 5000 })
    return {
      ...execution,
      output: execution.stdout + execution.stderr,
      cssPreserved: fs.existsSync(css),
      renamedCss: fs.existsSync(path.join(path.dirname(css), 'style.css')),
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

it('build exits nonzero after a renderer failure and waits for main to finish', () => {
  const result = runEntry('build.js', 'renderer')
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.output).toContain('synthetic renderer failure')
  expect(result.output).toContain('COMPILER_FINISHED')
  expect(result.output).not.toContain('successfully transpiled!')
})

it('build exits nonzero when main compilation fails after the renderer finishes', () => {
  const result = runEntry('build.js', 'main')
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.output).toContain('RENDERER_FINISHED')
  expect(result.output).toContain('TypeScript compilation failed with exit code: 2')
  expect(result.output).not.toContain('successfully transpiled!')
})

it.each([
  ['build.js', 'successfully transpiled!'],
  ['dev-server.js', 'DEV_ELECTRON_READY'],
])('%s succeeds without removing the exported common index.css', (entry, ready) => {
  const result = runEntry(entry)
  expect(result.error).toBeUndefined()
  expect(result.status, result.output).toBe(0)
  expect(result.output).toContain(ready)
  expect(result.cssPreserved).toBe(true)
  expect(result.renamedCss).toBe(false)
})

it('build invokes the project-local TypeScript compiler using this Node executable', () => {
  const result = runEntry('build.js')
  expect(result.status, result.output).toBe(0)
  const invocation = JSON.parse(result.stdout.split('\n').find(line => line.startsWith('COMPILER ')).slice(9))
  expect(invocation).toEqual({
    command: process.execPath,
    args: [require.resolve('typescript/bin/tsc')],
    cwd: path.join(root, 'src/main'),
  })
})
