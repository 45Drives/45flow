// Test fixture: copy of houston-broadcaster server/p2p/protocol.js at 6ffb979. Do not edit; used only by proxy.test.ts.
'use strict';

// Wire format for HTTP and WebSocket traffic over one WebRTC data channel.
// Spec: docs/p2p-protocol.md. The bridge (host side) and the viewer client
// both build on this module so the two ends cannot drift.

const VERSION = 1;
const CHANNEL_LABEL = 'http';
// Binary messages stay well under the 256 KB SCTP limit browsers accept.
const CHUNK = 64 * 1024 - 4;
// Bytes in flight per request/direction before the sender waits for an ack.
const WINDOW = 4 * 1024 * 1024;
// Pause reads when the channel send buffer passes this.
const BUFFER_HIGH = 8 * 1024 * 1024;
const BUFFER_LOW = 1024 * 1024;

const T = Object.freeze({
  HELLO: 'hello',
  REQ: 'req',
  BODY_END: 'bend',
  HEAD: 'head',
  END: 'end',
  ERR: 'err',
  ACK: 'ack',
  ABORT: 'abort',
  WS_OPEN: 'ws-open',
  WS_OPENED: 'ws-opened',
  WS_TEXT: 'ws-text',
  WS_BIN: 'ws-bin',
  WS_CLOSE: 'ws-close',
});

// Binary message = 4-byte big-endian request id, then payload bytes.
function encodeData(id, payload) {
  const out = Buffer.allocUnsafe(4 + payload.length);
  out.writeUInt32BE(id >>> 0, 0);
  Buffer.from(payload.buffer, payload.byteOffset, payload.length).copy(out, 4);
  return out;
}

function decodeData(msg) {
  if (!msg || !(msg.byteLength >= 4)) throw new Error('short binary frame');
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg.buffer || msg, msg.byteOffset || 0, msg.byteLength);
  return { id: buf.readUInt32BE(0), payload: buf.subarray(4) };
}

function encodeFrame(frame) {
  return JSON.stringify(frame);
}

function decodeFrame(text) {
  try {
    const f = JSON.parse(text);
    return f && typeof f === 'object' && typeof f.t === 'string' ? f : null;
  } catch {
    return null;
  }
}

// Only origin-relative paths may reach the target; never a viewer-chosen host.
function isForwardablePath(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return false;
  if (/[\\\x00-\x1f\x7f]/.test(url)) return false;
  try {
    const base = new URL('http://bridge.invalid');
    return new URL(url, base).origin === base.origin;
  } catch {
    return false;
  }
}

// Viewer side of the protocol over any node-datachannel-like channel
// (sendMessage/sendMessageBinary/bufferedAmount/onMessage/onClosed).
function createClient(dc) {
  const reqs = new Map();
  const wss = new Map();
  let nextId = 1;
  let hello = null;
  const sendJson = (f) => dc.sendMessage(encodeFrame(f));

  dc.onMessage((msg) => {
    if (typeof msg === 'string') {
      const f = decodeFrame(msg);
      if (!f) return;
      if (f.t === T.HELLO) { hello = f; return; }
      const h = reqs.get(f.id) || wss.get(f.id);
      if (!h) return;
      if (f.t === T.HEAD) h.head?.(f);
      else if (f.t === T.END) { reqs.delete(f.id); h.end?.(); }
      else if (f.t === T.ERR) { reqs.delete(f.id); wss.delete(f.id); h.err?.(f.message); }
      else if (f.t === T.ACK) h.onAck?.(f.n);
      else if (f.t === T.WS_OPENED) h.opened?.(f);
      else if (f.t === T.WS_TEXT) h.text?.(f.data);
      else if (f.t === T.WS_BIN) h.binary?.(Buffer.from(f.data, 'base64'));
      else if (f.t === T.WS_CLOSE) { wss.delete(f.id); h.close?.(f.code, f.reason); }
      return;
    }
    const { id, payload } = decodeData(msg);
    reqs.get(id)?.data?.(Buffer.from(payload));
  });
  dc.onClosed?.(() => {
    for (const h of reqs.values()) h.err?.('channel closed');
    for (const h of wss.values()) h.close?.(1006, 'channel closed');
    reqs.clear(); wss.clear();
  });

  // handlers: { head, data, end, err }. Returns { ack(n), abort(), id, sendBody }.
  function request({ method = 'GET', url, headers = [], body = null }, handlers) {
    const id = nextId++;
    const state = { acked: 0, sent: 0, waiter: null };
    const h = { ...handlers, onAck: (n) => { state.acked += n; state.waiter?.(); } };
    reqs.set(id, h);
    sendJson({ t: T.REQ, id, method, url, headers, body: body !== null && body !== undefined });
    const ctl = {
      id,
      ack: (n) => sendJson({ t: T.ACK, id, n }),
      abort: () => { reqs.delete(id); try { sendJson({ t: T.ABORT, id }); } catch { /* channel gone */ } },
      // Send a request body as binary pieces, waiting on host acks.
      async sendBody(buf) {
        for (let o = 0; o < buf.length; o += CHUNK) {
          while (state.sent - state.acked >= WINDOW || dc.bufferedAmount() >= BUFFER_HIGH) {
            await new Promise((r) => { state.waiter = r; setTimeout(r, 20); });
          }
          const piece = buf.subarray(o, o + CHUNK);
          dc.sendMessageBinary(encodeData(id, piece));
          state.sent += piece.length;
        }
        sendJson({ t: T.BODY_END, id });
      },
    };
    if (body !== null && body !== undefined) ctl.bodyDone = ctl.sendBody(Buffer.from(body));
    return ctl;
  }

  function openWebSocket({ url, protocols = [], headers = [] }, handlers) {
    const id = nextId++;
    wss.set(id, handlers);
    sendJson({ t: T.WS_OPEN, id, url, protocols, headers });
    return {
      id,
      sendText: (data) => sendJson({ t: T.WS_TEXT, id, data }),
      sendBinary: (buf) => sendJson({ t: T.WS_BIN, id, data: Buffer.from(buf).toString('base64') }),
      close: (code, reason) => sendJson({ t: T.WS_CLOSE, id, code, reason }),
    };
  }

  return { request, openWebSocket, get hello() { return hello; } };
}

module.exports = {
  VERSION, CHANNEL_LABEL, CHUNK, WINDOW, BUFFER_HIGH, BUFFER_LOW, T,
  encodeData, decodeData, encodeFrame, decodeFrame, isForwardablePath, createClient,
};
