# Browser foundation (Stage 1)

The browser entry point is `/app/` on the Houston Broadcaster nginx HTTPS listener. Both `/app` and `/app/` are restricted by the existing `45flow-admin-allow.conf` allowlist. nginx serves files from `/opt/45drives/45flow-web`, installed by the `45flow-web` package.

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
| `api-docs:open` | Opens `/api-docs/` on this server in a new tab; the page's session cookie signs it in (administrators only). The desktop app instead opens a sandboxed window that sends its token as a header on docs requests only (`src/main/apiDocsWindow.ts`) | Browser shim; desktop |
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

`/app/` is served only to licensed servers. nginx asks the Broadcaster (`auth_request` to `/api/license/web-access`) before serving anything under `/app/`; a refusal shows an upgrade page (HTTP 402). "Licensed" means active Pro/trial or paid Pro in legacy mode (`fallback: true`); expired/revoked trials are blocked even when their certificate and web package remain installed. `WEB_APP_LICENSE_GATE=off` is an explicit lab override that opens it to every server without regenerating nginx. Keep the gate enabled on production servers. The allowlist is checked first: a client outside it gets 403, never the upgrade page. This is a product gate, not a security boundary: every API is already authenticated, and the same APIs serve the desktop app on free servers. The static package is installable on any host; license enforcement happens on the hosting Broadcaster, not inside the package.

## Packaging and versioning (D-33)

`45flow-web` is a separate package whose version is the desktop app's (`package.json`).

```
make web-build      # build/web, with version.json (served at /app/version.json)
make web-package    # build/web-packages: .tar.gz, .deb, .rpm and SHA256SUMS
```

Output is reproducible: with `SOURCE_DATE_EPOCH` set, two builds give byte-identical packages. Packages install to `/opt/45drives/45flow-web` and `Recommend` houston-broadcaster. A pre-release version such as `1.2.0-beta.1` becomes `1.2.0~beta.1` so it sorts before the release. `version.json` records the version, git commit (`-dirty` when built from uncommitted changes) and build date.

Lab deployment without packages: `make install-remote REMOTE_HOST=<server>`; `make web-gate GATE=off REMOTE_HOST=<server>` lets an unlicensed lab server serve `/app/`.

### Repository packages and default installation (A2 #7)

`manifest.json`, `packaging/` and `.github/workflows/build-web-packages.yml` use the same 45Drives build/sign/publish pipeline as the Broadcaster. Builds cover Ubuntu Focal/Jammy, Debian Bookworm/Trixie and Rocky EL8/EL9. Debian packages are `all`; RPMs are `noarch`. The existing Broadcaster build images provide Node 22, Corepack and distro packaging tools. Checkout includes the Houston Common submodule; the package build installs locked dependencies, builds the common workspaces and builds the web renderer. Only static web files ship, not Node or Electron.

`package.json` remains the version source. Before the pipeline reads the manifest, `scripts/web/ci-prepare.sh` verifies the pinned commit and version, then copies the app version (including prerelease `~` normalization) into the manifest and its changelog version. It uses only POSIX tools because the package runner has no `node`; `sync-manifest.mjs` is the equivalent for local use. The manifest's build number controls package revisions.

The normal `yarn release:orchestrate` flow now requires the web package workflow after the selected desktop builds finish and before any GitHub release creation/upload/publication. A Windows `stage` run still stops for manual signing without publishing web packages; the `finalize` run executes the web step. No separate web command or version bump is needed.

The orchestrator records the source commit before desktop builds, verifies the Linux/Windows/macOS source after pull (or local source before Windows rsync) and writes a `source-commit` record into successful desktop staging directories. Windows finalize and macOS sign-only require that record to match the current commit; old stages without one must be rebuilt. `scripts/release/web-workflow.mjs` checks that the local commit/version have not changed, the source is clean and `GH_TAG_REF` points to that commit, then dispatches `build-web-packages.yml` with the exact source SHA and app version. A unique request ID selects only that dispatch's run, even during concurrent releases. Missing dispatches, build/sign/sync failures, cancellation and timeouts stop the release instead of allowing a desktop-only success.

The workflow is dispatch-only: it no longer runs on tag/branch pushes or creates/publishes GitHub releases. It checks out the pinned source with submodules, verifies its app version, builds all six distros, signs them, verifies four signed `all` DEBs and two `noarch` RPMs exist, updates local repositories and syncs remote repositories. The orchestrator waits for the entire workflow to succeed. Signed web packages are delivered through the 45Drives repositories; desktop GitHub assets and draft/publication remain owned by the orchestrator.

Before the first synchronized release:

1. Push the workflow and release helpers. The workflow must be registered on the repository's default branch. The desktop source commit and its submodule commits must also be pushed.
2. Ensure `gh` is authenticated with Actions read/write access (dispatch and watch), in addition to the existing release permissions. The self-hosted runners, existing images, signing key and repository configuration must be available.
3. Leave `WEB_WORKFLOW_REF` empty for the default branch's workflow, or set it to a pushed branch containing the workflow implementation to use. The source checkout remains pinned to the desktop source SHA regardless of this setting.
4. Run the existing orchestrator. Every completed run builds and pushes web packages, even if GitHub publication is disabled; Windows stage-only runs do not. `WEB_PACKAGES=0` (env file or environment) skips the web workflow for re-runs whose packages are already published, such as a publish-only run. Package publication precedes GitHub release publication and is not rolled back if a later GitHub upload fails.

Keep the desktop hosts' existing pull/sync commands on the intended release commit. Source drift is rejected rather than silently changing the selected release version or force-checking out remote worktrees. If the local Linux pull advances the commit, rerun from that commit. Reusing an existing staging directory from a different commit is rejected; choose a fresh staging directory and rebuild all targets.

The Broadcaster checks at startup, after successful admin license activation and every 15 minutes. An active license (including an active trial) with update entitlement installs a missing `45flow-web` from the host's configured apt/dnf/yum repositories. A transient `45flow-web-install` systemd unit runs the transaction outside the Broadcaster's `NoNewPrivileges` sandbox. Failures are logged and retried; they do not block startup or change the activation response. Use `journalctl -u houston-broadcaster -u 45flow-web-install` for diagnostics. Repository access, systemd and root privileges are required. No package is downloaded directly from GitHub and no repository or signing key is added automatically.

Unlicensed, expired-trial and non-update-entitled servers do not fetch packages. An existing package is neither automatically upgraded nor removed when licensing changes; access remains subject to the existing nginx license gate and allowlist. To upgrade an installed web UI, use normal OS package management while entitled. The web package does not change nginx or restart services, and no new API routes or database migrations are introduced.

## Deferred

- First signed repository publication and live installation checks on licensed Debian/Rocky servers (including activation after startup, package-manager lock recovery and uninstall/reinstall).
- Browser validation across supported browsers (C6) and a repeatable end-to-end smoke script in the repository.
