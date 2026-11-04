# Browser foundation (Stage 1)

The browser entry point is `/app/` on the Houston Broadcaster nginx HTTPS listener. Both `/app` and `/app/` are restricted by the existing `45flow-admin-allow.conf` allowlist. nginx serves files from `/opt/45drives/45flow-web`; deployment of the build into that directory is intentionally not part of this stage.

## IPC compatibility map

| Electron channel or API | Browser behavior | Owner / follow-up |
|---|---|---|
| `scan-network-fallback` | `POST /api/discovery/scan`, then `GET /api/discovery` | Houston Broadcaster API |
| `discovered-servers` | `GET /api/discovery/stream` Server-Sent Events | Houston Broadcaster API |
| `renderer-ready`, `license:update-eligible` | No-op; renderer startup and desktop update eligibility do not need a browser IPC call | Browser shim |
| `get-os`, `is-appimage`, `is-dev` | Return browser-safe values (`browser`, `false`, `false`) | Browser shim |
| `secureToken.status/get/set/clear` | In-memory token storage only; passwords are not stored; page reload clears credentials | Browser shim; replace with B1 session contract |
| `IPCMessage` | Rejected; legacy backup/cockpit routing is desktop-only | Desktop |
| `backup:isFirstRunNeeded` | Rejected with desktop-only guidance | Desktop |
| `get-client-ident` | Not exposed to the renderer or browser | Desktop |
| `dialog:openFolder` | Rejected with desktop-only guidance | Desktop |
| `pickFiles`, `pickFolder`, `pickWatermark`, `getPathForFile` (`dialog:pickFiles`, `dialog:pickFolder`, `dialog:pickWatermark`) | Implemented with the browser file picker and drag-and-drop. Chosen `File` objects are held in memory under a synthetic `browser-file://` path; folder picking includes only the folder's direct files, as on desktop | Browser shim (`web-upload.ts`) |
| `ensure-ssh-ready`, `remote-check-broadcaster`, `probe-health`, `run-remote-bootstrap` | Rejected; browser sign-in skips SSH, package preflight, health probing, and bootstrap | Desktop; server setup remains outside browser |
| `verify-nginx-certificate-over-ssh` | Rejected; SSH certificate inspection and Admin Networks are desktop-only | Desktop |
| `logs:read-client`, `log:info`, `log:warn`, `log:error` | Client logs are not exposed; browser logs go to the console | Browser / desktop |
| `update:check`, `update:download`, `update:install` and `update:*` events | Unavailable; desktop update UI is hidden | Desktop |
| `http-upload:start`, `http-upload:cancel`, `http-upload:progress:*`, `http-upload:done:*`, `upload:ingest:*` | Implemented in the browser by the same `/api/local-upload` init → chunked PATCH → complete code as desktop (`src/shared/chunkedUpload.ts`; the desktop reads chunks from disk, the browser from a `File`), through the page origin (nginx). Powers the Upload Files wizard, Quick Share drag-and-drop and the transfer dock. Closing the tab cancels an upload (the browser asks to confirm) | Shared core; browser shim (`web-upload.ts`) |
| `transcode:start`, `transcode:cancel`, `transcode:cancel-all-active`, `transcode:full-start`, `transcode:full-cancel`, `transcode:get-capabilities`, `transcode-output-upload`, `transcode:cleanup-temp`, `transcode:cleanup-watermark` | Rejected; local transcoding is unavailable | Desktop |
| `transcode:progress:*`, `transcode:done:*`, `transcode:failed:*`, `transcode:full-progress:*`, `transcode:full-done:*`, `transcode:full-failed:*` | Unavailable; progress events belong to desktop transcode jobs | Desktop |
| `watermark:download` and native filesystem-path access | Rejected; only needed by desktop client-side transcoding, which is off in the browser (the server applies watermarks) | Desktop |
| `bootstrap-progress`, `notification`, `update:available`, `update:checking`, `update:downloaded`, `update:error`, `update:none`, `update:progress` | No desktop event source is provided | Desktop |

This first browser sign-in uses the current `POST /api/login` bearer-token contract and keeps the token only in memory. It does not persist the password or token in browser storage. The UI explicitly asks users to sign in again after a reload or tab close. Once B1 defines the browser session contract, replace this interim behavior.

## Deferred

- Server-controlled B1 browser session/cookie contract.
- Delivery/versioning of the web build and installation into `/opt/45drives/45flow-web`.
- Pro license gating for `/app`, smoke testing, user/admin guide changes, and handoff.
