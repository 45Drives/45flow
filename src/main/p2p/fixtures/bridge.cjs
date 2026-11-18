// Test fixture: copy of houston-broadcaster server/p2p/bridge.js at 6ffb979 (host side of docs/p2p-protocol.md). Do not edit; used only by proxy.test.ts.
'use strict';

// Host-side bridge: serves HTTP and WebSocket requests that arrive over a
// WebRTC data channel by replaying them against the local ingress
// (HB_P2P_INGRESS). Wire format: docs/p2p-protocol.md.

const http = require('node:http');
const https = require('node:https');
const WebSocket = require('ws');
const {
  VERSION, CHUNK, WINDOW, BUFFER_HIGH, BUFFER_LOW, T,
  encodeData, decodeData, encodeFrame, decodeFrame, isForwardablePath,
} = require('./bridge-protocol.cjs');

const HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer',
  'content-encoding', 'set-cookie', 'alt-svc', 'strict-transport-security',
]);
const WS_SKIP = new Set([...HOP, 'host', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol', 'cookie']);

const MAX_REQS = 64;
const MAX_SOCKETS = 16;
const MAX_UP_BUFFER = 8 * 1024 * 1024;
const MAX_WS_QUEUE = 1024 * 1024;
const isId = (id) => Number.isInteger(id) && id >= 0 && id <= 0xFFFFFFFF;
const isPairs = (h) => h === undefined || (Array.isArray(h) && h.every((p) => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string'));

function createBridge({ target = process.env.HB_P2P_INGRESS, log = () => {} } = {}) {
  if (!target) throw new Error('HB_P2P_INGRESS is not set');
  const TARGET = new URL(target);
  const lib = TARGET.protocol === 'https:' ? https : http;
  // The ingress is the local nginx, usually with a self-signed certificate.
  const agent = new lib.Agent({ keepAlive: true, rejectUnauthorized: false });

  // Attach to one open data channel. `jar` is the viewer's cookie jar and
  // lives as long as the peer; service workers cannot see cookies.
  function attach(dc, { jar = new Map() } = {}) {
    const reqs = new Map();
    const sockets = new Map();
    let badFrames = 0;
    const sendJson = (f) => { try { dc.sendMessage(encodeFrame(f)); } catch { /* channel gone */ } };
    const canSend = (r) => r.sent - r.acked < WINDOW && dc.bufferedAmount() < BUFFER_HIGH;
    const resume = (r) => { if (r.res && r.res.isPaused() && canSend(r)) r.res.resume(); };

    dc.setBufferedAmountLowThreshold(BUFFER_LOW);
    dc.onBufferedAmountLow(() => reqs.forEach(resume));
    dc.onClosed(() => {
      reqs.forEach((r) => r.up?.destroy());
      sockets.forEach((s) => { try { s.terminate(); } catch { /* already gone */ } });
      reqs.clear(); sockets.clear();
    });

    const fail = (id, message) => sendJson({ t: T.ERR, id, message });

    function buildHeaders(m) {
      const headers = {};
      // Node frames the body itself (chunked): a viewer-supplied length on the
      // shared keep-alive agent would let one viewer desync the connection.
      for (const [k, v] of m.headers || []) {
        const name = k.toLowerCase();
        if (!HOP.has(name) && name !== 'host' && name !== 'content-length') headers[name] = v;
      }
      headers.host = TARGET.host;
      headers['accept-encoding'] = 'identity';
      if (headers.origin) headers.origin = TARGET.origin;
      if (headers.referer) {
        try { const ref = new URL(headers.referer); headers.referer = TARGET.origin + ref.pathname + ref.search; } catch { delete headers.referer; }
      }
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      return headers;
    }

    function startRequest(m) {
      if (!isId(m.id) || reqs.has(m.id) || sockets.has(m.id)) { if (isId(m.id)) fail(m.id, 'duplicate id'); return; }
      if (!isForwardablePath(m.url) || typeof m.method !== 'string' || !isPairs(m.headers)) { fail(m.id, 'bad path'); return; }
      if (reqs.size >= MAX_REQS) { fail(m.id, 'too many requests'); return; }
      const r = { sent: 0, acked: 0, res: null, up: null };
      const url = new URL(m.url, TARGET);
      if (url.origin !== TARGET.origin) { fail(m.id, 'bad path'); return; }
      reqs.set(m.id, r);
      try {
        r.up = lib.request(url, { method: m.method, headers: buildHeaders(m), agent }, (res) => {
          r.res = res;
          for (const c of [].concat(res.headers['set-cookie'] || [])) {
            const [pair] = c.split(';'); const eq = pair.indexOf('=');
            if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
          }
          const out = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const k = res.rawHeaders[i]; let v = res.rawHeaders[i + 1];
            if (HOP.has(k.toLowerCase())) continue;
            if (k.toLowerCase() === 'location' && v.startsWith(TARGET.origin)) v = v.slice(TARGET.origin.length) || '/';
            out.push([k, v]);
          }
          sendJson({ t: T.HEAD, id: m.id, status: res.statusCode, statusText: res.statusMessage, headers: out });
          res.on('data', (chunk) => {
            for (let o = 0; o < chunk.length; o += CHUNK) {
              const piece = chunk.subarray(o, o + CHUNK);
              try { dc.sendMessageBinary(encodeData(m.id, piece)); } catch { r.up.destroy(); return; }
              r.sent += piece.length;
            }
            if (!canSend(r)) res.pause();
          });
          res.on('end', () => { reqs.delete(m.id); sendJson({ t: T.END, id: m.id }); });
          res.on('error', (e) => { if (reqs.delete(m.id)) fail(m.id, e.message); });
          res.on('close', () => { if (!res.complete && reqs.delete(m.id)) fail(m.id, 'upstream closed'); });
        });
      } catch (e) { reqs.delete(m.id); fail(m.id, e.message); return; }
      r.up.on('error', (e) => { if (reqs.has(m.id)) { reqs.delete(m.id); fail(m.id, e.message); } });
      if (!m.body) r.up.end();
    }

    function startWebSocket(m) {
      if (!isId(m.id) || reqs.has(m.id) || sockets.has(m.id)) { if (isId(m.id)) fail(m.id, 'duplicate id'); return; }
      if (!isForwardablePath(m.url) || !isPairs(m.headers) || (m.protocols !== undefined && !(Array.isArray(m.protocols) && m.protocols.every((x) => typeof x === 'string')))) { fail(m.id, 'bad path'); return; }
      if (sockets.size >= MAX_SOCKETS) { fail(m.id, 'too many websockets'); return; }
      const url = new URL(m.url, TARGET);
      if (url.origin !== TARGET.origin) { fail(m.id, 'bad path'); return; }
      url.protocol = TARGET.protocol === 'https:' ? 'wss:' : 'ws:';
      const headers = {};
      for (const [k, v] of m.headers || []) if (!WS_SKIP.has(k.toLowerCase())) headers[k.toLowerCase()] = v;
      if (headers.origin) headers.origin = TARGET.origin;
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      let ws;
      try {
        ws = new WebSocket(url, m.protocols || [], { headers, agent, rejectUnauthorized: false, perMessageDeflate: false });
      } catch (e) { fail(m.id, e.message); return; }
      const queue = { items: [], bytes: 0 };
      ws.queue = queue;
      sockets.set(m.id, ws);
      ws.on('open', () => {
        sendJson({ t: T.WS_OPENED, id: m.id, protocol: ws.protocol });
        for (const [data, opts] of queue.items.splice(0)) { try { ws.send(data, opts); } catch { /* closing */ } }
      });
      ws.on('message', (data, isBinary) => {
        if (isBinary) sendJson({ t: T.WS_BIN, id: m.id, data: Buffer.from(data).toString('base64') });
        else sendJson({ t: T.WS_TEXT, id: m.id, data: data.toString() });
      });
      ws.on('close', (code, reason) => {
        if (sockets.delete(m.id)) sendJson({ t: T.WS_CLOSE, id: m.id, code, reason: reason.toString() });
      });
      ws.on('error', (e) => { if (sockets.delete(m.id)) fail(m.id, e.message); });
    }

    function wsSend(m, data, opts) {
      const ws = sockets.get(m.id);
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN) { ws.send(data, opts); return; }
      if (ws.readyState !== WebSocket.CONNECTING) return;
      const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
      if (ws.queue.bytes + size > MAX_WS_QUEUE) { fail(m.id, 'websocket not open'); return; }
      ws.queue.bytes += size;
      ws.queue.items.push([data, opts]);
    }

    function handleMessage(msg) {
      if (typeof msg !== 'string') {
        const { id, payload } = decodeData(msg);
        const r = reqs.get(id);
        if (r && r.up && !r.up.destroyed) {
          const n = payload.length;
          r.up.write(Buffer.from(payload), () => sendJson({ t: T.ACK, id, n }));
          // Viewer ignoring the ack window: refuse to buffer without bound.
          if (r.up.writableLength > MAX_UP_BUFFER) {
            reqs.delete(id); r.up.destroy(); r.res?.destroy();
            fail(id, 'upload buffer exceeded');
          }
        }
        return;
      }
      const m = decodeFrame(msg);
      if (!m) { badFrames++; return; }
      if (!isId(m.id) && m.t !== T.HELLO) { badFrames++; return; }
      const r = reqs.get(m.id);
      switch (m.t) {
        case T.REQ: startRequest(m); break;
        case T.BODY_END: r?.up?.end(); break;
        case T.ACK: if (r && Number.isFinite(m.n) && m.n > 0) { r.acked += m.n; resume(r); } break;
        case T.ABORT: if (r) { r.up?.destroy(); r.res?.destroy(); reqs.delete(m.id); } break;
        case T.WS_OPEN: startWebSocket(m); break;
        case T.WS_TEXT: if (typeof m.data === 'string') wsSend(m, m.data); else badFrames++; break;
        case T.WS_BIN: if (typeof m.data === 'string') wsSend(m, Buffer.from(m.data, 'base64'), { binary: true }); else badFrames++; break;
        case T.WS_CLOSE: {
          const s = sockets.get(m.id);
          if (s) {
            const code = Number.isInteger(m.code) && m.code >= 1000 && m.code < 5000 && m.code !== 1005 && m.code !== 1006 ? m.code : 1000;
            try { s.close(code, typeof m.reason === 'string' ? m.reason : ''); } catch { s.terminate(); }
          }
          break;
        }
        default: break;
      }
    }

    dc.onMessage((msg) => {
      try { handleMessage(msg); } catch (e) {
        badFrames++;
        log(`p2p bridge: dropped bad frame (${badFrames}): ${e.message}`);
      }
    });

    sendJson({ t: T.HELLO, v: VERSION });
  }

  return { attach, target: TARGET.origin, close: () => agent.destroy() };
}

module.exports = { createBridge };
