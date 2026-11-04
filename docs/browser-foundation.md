# Browser foundation (Stage 1)

The browser entry point is `/app/` on the Houston Broadcaster nginx HTTPS listener. Both `/app` and `/app/` are restricted by the existing `45flow-admin-allow.conf` allowlist. nginx serves files from `/opt/45drives/45flow-web`; deployment of the build into that directory is intentionally not part of this stage.

## IPC compatibility map

| Electron channel or API | Browser behavior | Owner / follow-up |
|---|---|---|
| `scan-network-fallback`, `discovered-servers` | No-op (empty list, no event stream). The browser only talks to the server that hosts it, so there is nothing to discover | Browser shim |
| `renderer-ready`, `license:update-eligible` | No-op; renderer startup and desktop update eligibility do not need a browser IPC call | Browser shim |
| `get-os`, `is-appimage`, `is-dev` | Return browser-safe values (`browser`, `false`, `false`) | Browser shim |
| `secureToken.status/get/set/clear` | In-memory only and holds just a placeholder (`browser-session`); the real credential is the server's httpOnly cookie. Passwords are never stored | Browser shim, `web-session.ts` |
| `IPCMessage` | Rejected; legacy backup/cockpit routing is desktop-only | Desktop |
| `backup:isFirstRunNeeded` | Rejected with desktop-only guidance | Desktop |
| `get-client-ident` | Not exposed to the renderer or browser | Desktop |
| `dialog:openFolder` | Rejected with desktop-only guidance | Desktop |
| `pickFiles`, `pickFolder`, `pickWatermark`, `getPathForFile` (`dialog:pickFiles`, `dialog:pickFolder`, `dialog:pickWatermark`) | Implemented with the browser file picker and drag-and-drop. Chosen `File` objects are held in memory under a synthetic `browser-file://` path; folder picking includes only the folder's direct files, as on desktop | Browser shim (`web-upload.ts`) |
| `ensure-ssh-ready`, `remote-check-broadcaster`, `probe-health`, `run-remote-bootstrap` | Rejected; browser sign-in skips SSH, package preflight, health probing, and bootstrap | Desktop; server setup remains outside browser |
| `verify-nginx-certificate-over-ssh` | Not called in the browser: the browser already verified this page's certificate, so Admin Networks works without SSH | Desktop only |
| `logs:read-client`, `log:info`, `log:warn`, `log:error` | Implemented by an in-tab log (`web-log.ts`): `appLog` events, uncaught errors, unhandled rejections and failed API calls, with secrets redacted. Newest 500 entries, kept in `sessionStorage` for the tab. Shown in the Log Viewer as **Browser Logs** with a Download button | Browser shim |
| `update:check`, `update:download`, `update:install` and `update:*` events | Unavailable; this is the desktop app's self-update. **Server** updates work through `/api/admin/broadcaster-update-*` for administrators | Desktop |
| `http-upload:start`, `http-upload:cancel`, `http-upload:progress:*`, `http-upload:done:*`, `upload:ingest:*` | Implemented in the browser by the same `/api/local-upload` init → chunked PATCH → complete code as desktop (`src/shared/chunkedUpload.ts`; the desktop reads chunks from disk, the browser from a `File`), through the page origin (nginx). Powers the Upload Files wizard, Quick Share drag-and-drop and the transfer dock. Closing the tab cancels an upload (the browser asks to confirm) | Shared core; browser shim (`web-upload.ts`) |
| `transcode:start`, `transcode:cancel`, `transcode:cancel-all-active`, `transcode:full-start`, `transcode:full-cancel`, `transcode:get-capabilities`, `transcode-output-upload`, `transcode:cleanup-temp`, `transcode:cleanup-watermark` | Rejected; local transcoding is unavailable | Desktop |
| `transcode:progress:*`, `transcode:done:*`, `transcode:failed:*`, `transcode:full-progress:*`, `transcode:full-done:*`, `transcode:full-failed:*` | Unavailable; progress events belong to desktop transcode jobs | Desktop |
| `watermark:download` and native filesystem-path access | Rejected; only needed by desktop client-side transcoding, which is off in the browser (the server applies watermarks) | Desktop |
| `bootstrap-progress`, `notification`, `update:available`, `update:checking`, `update:downloaded`, `update:error`, `update:none`, `update:progress` | No desktop event source is provided | Desktop |

## Sign-in and sessions

The browser signs in with `POST /api/session` on the page's own origin and receives an httpOnly, Secure, SameSite=Strict cookie. It never holds a token or password. Sessions survive reloads (the page calls `GET /api/session` on load and resumes), end after 15 idle minutes or 12 hours, and are revoked on Log Out. Every write carries an `X-CSRF-Token`; `web-session.ts` wraps `fetch` so existing call sites need no changes. The full contract, which B3 enforces, is `houston-broadcaster/docs/browser-session-contract.md`.

Idle handling (`web-idle.ts`, `useSessionIdle.ts`, `SessionIdlePrompt.vue`): while the user is active (mouse, keys, touch) the page sends a keepalive at most every minute, scaled down for short timeouts. About two minutes before the end it asks the server, without extending the session, how long is left, shows a "Stay signed in" prompt, and signs out when the time runs out. Several tabs share one session and agree through the server.

**What counts as activity** is decided only by the server, which answers every authenticated request with `X-Session-Activity: counted` or `background`. The page marks requests it makes by itself (progress polling: `/api/progress/active`, `/api/transcodes/:id/jobs`, `/api/progress/files/batch`) with `X-Background-Request: 1` (`background-request.ts`). Without that, the transfer dock's 15 second poll would keep every session alive forever, desktop included. When you add a new poller, send that header.

The desktop app keeps its Bearer token, now bound to a server-side session. `desktop-session.ts` refreshes it while the user is active, picks up the rotated token the server hands out, defers rotation while a transfer runs, and revokes the session on Log Out.

## Other browser behavior

- **Servers:** the multi-server switcher is replaced by a static server badge; discovery is a no-op.
- **Uploads:** shared chunked-upload core (`src/shared/chunkedUpload.ts`); files come from browser pickers and drag-and-drop.
- **Admin Networks and server updates:** work in the browser for administrators. After a server update the session resumes without a new sign-in.
- **Notifications:** opt-in in Settings → Preferences (`web-notify.ts`). A browser notification appears only when an upload finishes or fails while the tab is in the background.
- **Clipboard:** `clipboard.ts` falls back to selection-and-copy when `navigator.clipboard` is unavailable.
- **Still desktop-only:** client-side transcoding (Settings → Performance explains), SSH setup and bootstrap, the desktop app's self-update, resuming an interrupted upload, remembering a password (deliberately not offered).

## Pro gate (A-04)

`/app/` is served only to licensed servers. nginx asks the Broadcaster (`auth_request` to `/api/license/web-access`) before serving anything under `/app/`; a refusal shows an upgrade page (HTTP 402). "Licensed" means Pro or Pro in legacy mode, the same rule as `requireLicense`. `WEB_APP_LICENSE_GATE=off` in the Broadcaster's environment opens it to every server without regenerating nginx, so the production policy can change with a restart. The allowlist is checked first: a client outside it gets 403, never the upgrade page. This is a product gate, not a security boundary: every API is already authenticated, and the same APIs serve the desktop app on free servers.

## Packaging and versioning (D-33)

`45flow-web` is a separate package whose version is the desktop app's (`package.json`).

```
make web-build      # build/web, with version.json (served at /app/version.json)
make web-package    # build/web-packages: .tar.gz, .deb, .rpm and SHA256SUMS
```

Output is reproducible: with `SOURCE_DATE_EPOCH` set, two builds give byte-identical packages. Packages install to `/opt/45drives/45flow-web` and `Recommend` houston-broadcaster. A pre-release version such as `1.2.0-beta.1` becomes `1.2.0~beta.1` so it sorts before the release. `version.json` records the version, git commit (`-dirty` when built from uncommitted changes) and build date.

Lab deployment without packages: `make install-remote REMOTE_HOST=<server>`; `make web-gate GATE=off REMOTE_HOST=<server>` lets an unlicensed lab server serve `/app/`.

## Deferred

- Publishing the packages to the 45Drives repositories and the "installed by default on licensed servers" policy (D-33). That needs the repository and the Broadcaster's install/licence-activation flow; nothing here installs the package automatically.
- Production decision on whether `/app` stays Pro-only (`WEB_APP_LICENSE_GATE`).
- Browser validation across supported browsers (C6) and a repeatable end-to-end smoke script in the repository.
