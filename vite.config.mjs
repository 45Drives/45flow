// vite.config.mjs
import path from 'path';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json' with { type: 'json' };

const r = (...p) => path.join(process.cwd(), ...p);

export default defineConfig(({ command, mode }) => {
  // `command` is 'serve' (dev) or 'build' (prod)
  const isDev = command === 'serve';
  const env = loadEnv(mode, process.cwd(), ''); // loads .env, .env.development, .env.production

  // Allow overrides via env, otherwise sane defaults that work for both
  const PORT = Number(env.VITE_PORT || (isDev ? 8081 : 8080));
  const HOST = env.VITE_HOST || (isDev ? '127.0.0.1' : '0.0.0.0');
  const BASE = env.VITE_BASE || './'; // keep relative for Caddy/Electron
  // SOURCE_DATE_EPOCH (seconds) makes the web bundle reproducible; otherwise the build time is used.
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  const BUILD_DATE = new Date(Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : Date.now()).toISOString();

  return {
    root: r('src', 'renderer'),
    publicDir: 'public',
    base: BASE,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    },
    server: {
      port: PORT,
      host: HOST,        // LAN dev? set VITE_HOST=0.0.0.0
      strictPort: false, // let Vite pick a free port if taken
      // proxy: { ... }   // if you ever need API proxies in dev
    },
    build: {
      outDir: r('build', 'renderer'),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name][extname]',
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
        },
      },
    },
    plugins: [
      vue({
        template: {
          compilerOptions: { isCustomElement: (tag) => tag === 'webview' },
        },
      }),
    ],
    resolve: {
      alias: [
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        // Keep these so both dev & prod can resolve the package root, but
        // match the BARE specifier only (anchored regex, not a plain string
        // key). A plain string key prefix-matches any subpath too (e.g.
        // '@45drives/houston-common-ui/style.css'), which would rewrite it
        // straight to '<dist-dir>/style.css' and bypass the package's own
        // package.json#exports subpath map (which correctly points
        // './style.css' at './dist/index.css'). Anchoring to the bare
        // specifier lets subpath imports fall through to normal node
        // resolution while still aliasing the root import.
        {
          find: /^@45drives\/houston-common-lib$/,
          replacement: fileURLToPath(new URL('./node_modules/@45drives/houston-common-lib/dist', import.meta.url)),
        },
        {
          find: /^@45drives\/houston-common-ui$/,
          replacement: fileURLToPath(new URL('./node_modules/@45drives/houston-common-ui/dist', import.meta.url)),
        },
      ],
    },
  };
});
