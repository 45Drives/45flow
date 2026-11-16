// Vite dev server for `scripts/dev/dev.sh vite`: the repo config plus an /api
// proxy to the local Houston Broadcaster on 127.0.0.1:9095.
//
// dev.sh passes a self-signed certificate (FLOW_DEV_VITE_CERT/KEY) so the
// server runs on HTTPS on every interface, e.g. https://<lan-ip>:8081. HTTPS
// is required off localhost: the backend only signs browsers in over HTTPS
// and its session cookie is Secure, which browsers drop on plain-http IPs.
// Without a certificate it falls back to http://localhost:8081 only.
import fs from 'node:fs';
import base from '../../vite.config.mjs';

export default (env) => {
  const cfg = base(env);
  const certFile = process.env.FLOW_DEV_VITE_CERT;
  const keyFile = process.env.FLOW_DEV_VITE_KEY;
  const https = certFile && keyFile
    ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
    : undefined;

  cfg.server = {
    ...cfg.server,
    host: https ? true : 'localhost',
    port: 8081,
    strictPort: true,
    https,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9095',
        ws: true,
        // The backend trusts X-Forwarded-Proto from 127.0.0.1, where this
        // proxy runs; it checks the browser's Origin against the Host header,
        // which the proxy passes through unchanged.
        headers: { 'X-Forwarded-Proto': 'https' },
      },
    },
  };
  return cfg;
};
