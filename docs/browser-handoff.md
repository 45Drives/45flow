# Browser web UI, Stage 1: handoff to B and C

Stage 1 (A2) is built and checked. This is what B and C need to build on it. Details live in [browser-foundation.md](./browser-foundation.md) and the Broadcaster's `docs/browser-session-contract.md`.

## What exists

- The full 45Flow app runs in a browser at `https://<server>/app/`, on the existing nginx, behind the admin allowlist, for Pro servers.
- It is the same renderer as the desktop app. Where Electron is absent, `src/renderer/ipc-web-shim.ts` provides `window.electron`; every desktop-only channel is mapped, handled or rejected with guidance (see the table in `browser-foundation.md`).
- Sign-in uses a cookie session (`POST /api/session`); the desktop app keeps its Bearer token, now backed by a server-side session. Both follow one set of rules.
- Packages: `make web-package` builds `45flow-web` (.tar.gz, .deb, .rpm) with a checksum file. `make install-remote` deploys to a lab server.

## For Track B (security)

**B1 #2 (browser session contract, B-10)** is published: `houston-broadcaster/docs/browser-session-contract.md`. It needs the Track B owner's sign-off.

**B3 #4 (session rules, B-18/B-23)**: implemented for desktop and browser.

| Rule | Where | Test |
|---|---|---|
| 15 minute server-side idle, 12 hour absolute | `server/utils/sessions.js` | `sessions.test.js`, `sessions-desktop.test.js` |
| Rotation (cookie and desktop token) with a short grace period | same | same |
| Secure cookie flags, CSRF, same-origin check | same, `server/api/session.js` | `sessions.test.js` |
| Revocation: logout, admin revoke, WebSocket closes | `server/api/session.js`, `server/api/websocket.js` | both |
| Polling is not user activity (`X-Background-Request`) | `sessions.js`, client `background-request.ts` | `sessions-desktop.test.js` |
| No tokens in URLs or logs | `server/utils/safe-url.js` | `sessions-desktop.test.js` |
| Older desktop tokens keep working unless `REQUIRE_SESSION_TOKENS=1` | `sessions.js` | `sessions-desktop.test.js` |

Open items B should know about:

- **Failed-login lockout and admin unlock** is B3 #3. Today there is only a rate limit (10 per 5 minutes per IP and username).
- **Logout and access removal everywhere** (B-17, B3 #5): logout and admin revoke work for both clients. Removing a user's access does not yet revoke their sessions, and a request already being served finishes after a revoke.
- **Two-step login** (B3 #1, #6) is not started. `verifyCredentials()` in `server/api/auth.js` is the one place both sign-in endpoints check credentials, so a second factor belongs there.
- **Idle timeout for older desktop versions**: tokens issued before this change have no session, so they do not idle out until their own 12 hour expiry. Set `REQUIRE_SESSION_TOKENS=1` once clients have updated.
- The contract doc is the first Broadcaster doc whitelisted in `.gitignore`; `docs/*.md` is otherwise ignored there.

## For Track C (sharing and media)

- **Anything new that talks to the server must work from a browser.** Use `useApi().apiFetch`; do not call `window.electron` directly without a browser path. The browser path for a desktop-only call is a rejection with a clear message (`notifyUnsupported` in the shim) or a real implementation.
- **New polling needs `X-Background-Request: 1`** (`BACKGROUND_REQUEST` in `src/renderer/background-request.ts`), or it will keep sessions alive and defeat the idle timeout.
- **New request headers** the desktop app sends need adding to the CORS `allowedHeaders` in `server/app.js`; the desktop calls the server cross-origin and the preflight blocks anything not listed.
- **Uploads** use the shared core in `src/shared/chunkedUpload.ts`. The desktop supplies bytes from disk; the browser from a `File`.
- **The desktop app talks to the server over HTTPS through nginx** (B2 #1), trusting the certificate it reads over SSH (`src/main/serverTrust.ts`). Network calls from the main process must use Electron's `net.fetch` or `net.request`, not Node's `fetch`, `http` or `https`, or they will not trust the server's certificate. Port 9095 is only for discovery, health and setup.
- **Server file-type rules apply**: `.bin` is rejected, for example. Test uploads with real media or document types.
- **Client-side transcoding is off in the browser.** Anything that assumes local ffmpeg must have a server path.

### Browser validation checklist (C6, per release)

Run on a lab server that is on the allowlist, in each supported browser:

1. `/app` redirects to `/app/`; the page loads; `/app/version.json` shows the expected version.
2. From a network outside the allowlist, `/app/` and `/api/session` return 403.
3. On an unlicensed server (gate on), `/app/` shows the Pro page; public share links still work.
4. Sign in; reload (stays signed in); Log Out (cookie cleared; reload stays signed out).
5. In dev tools: the cookie is `HttpOnly; Secure; SameSite=Strict`; no password or session value in storage; no request carries a bearer token.
6. Leave the tab alone past the idle time: the "Stay signed in" prompt appears, then sign-out with an explanation. Keep working: no prompt.
7. Upload Files with a small file and a file over 5 MB (chunked); verify the file on the server. Choose a folder. Cancel mid-upload.
8. Drag a file onto the Dashboard; complete Quick Share; open the link in a private window.
9. Create Link with a watermark image chosen from the computer.
10. View Logs: Browser Logs tab, Download, Server Logs.
11. Settings: Admin Networks opens; Performance explains desktop-only processing; notifications can be turned on.
12. First-visit tours: "Skip tour" ends that screen's tour and it does not return.
13. Restart the Broadcaster: the browser stays signed in.

### Things not verified in a real browser yet

Safari and Firefox (all checks so far used Chrome), the Electron desktop app against the new server, a server with a real license, and a server behind the real certificate and port forward. The desktop session protocol was checked against the running server with scripted requests, not through the Electron app.
