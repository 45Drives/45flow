// Vite dev server for `scripts/dev/dev.sh vite`: the repo config plus an /api
// proxy to the local Houston Broadcaster on 127.0.0.1:9095.
import base from '../../vite.config.mjs';

export default (env) => {
  const cfg = base(env);
  cfg.server = {
    ...cfg.server,
    // Use "localhost", not 127.0.0.1: browsers only keep the backend's Secure
    // session cookie over plain http on localhost.
    host: 'localhost',
    port: 8081,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9095',
        ws: true,
        // The backend only issues browser sessions over HTTPS and trusts
        // X-Forwarded-Proto from 127.0.0.1, which is where this proxy runs.
        headers: { 'X-Forwarded-Proto': 'https' },
      },
    },
  };
  return cfg;
};
