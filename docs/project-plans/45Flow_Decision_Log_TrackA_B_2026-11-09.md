# Phase 2 decision log: Track A and early Track B (to 9 Nov 2026)

Decisions made while building Track A (A1–A5) and the Track B work done alongside it (B1, B2 #1, B3 #4), plus two Track B items built by Track C (B1 #1 credential contract, the B3 #9 approver check). Thread IDs (A1–A7, B1–B6) follow the Phase 2 project plan. D-numbers refer to the project's decision register (D-01 to D-37), which is kept outside this repository.

The register asks for *agreed* answers. Most entries below were made during development and are built, but nobody has signed them off yet. Each entry has a status:

- **Built**: implemented and tested; no sign-off needed beyond normal review.
- **Built, needs sign-off**: implemented, but it answers or narrows a register decision, or changes a default. The named owner should confirm it or reverse it.
- **Provisional**: built so work could continue; the plan already marks it as unconfirmed.

Evidence: commits in `45flow-premium-dev` (client) and `houston-broadcaster` (server), 4–9 Nov, plus the docs named in each section. On 9 Nov the Track C work was merged with the Track A/B work; the combined server passes its test suite.

---

## 1. Register decisions answered or narrowed

| ID | Question (short) | Answer as built | Status | Still open |
|---|---|---|---|---|
| **D-06 / D-18** | Which workflows work in the browser and which stay desktop-only? | **Browser:** sign-in, projects, links, Quick Share, uploads (file and folder pickers, drag-and-drop, chunked), watermark image pick, Activity/Browser Logs, Admin Networks, server updates, API docs, opt-in notifications. **Desktop only:** client-side transcoding (the server transcodes), SSH setup and bootstrap, the desktop app's self-update, server discovery and the multi-server switcher (the browser shows a fixed server badge), resuming an interrupted upload, saving a password (deliberately not offered), legacy backup/cockpit IPC. Full map: `docs/browser-foundation.md`. A Broadcaster restart or update does not sign browsers out. | Built, needs sign-off (Track A developer + Support) | Supported browser list: only Chrome tested. Safari and Firefox are untested (C6). |
| **D-21** | Is web admin Pro-only? | `/app/` is gated by nginx `auth_request` to `/api/license/web-access`. A refusal shows an upgrade page (HTTP 402). The allowlist is checked first, so callers outside it get 403. "Licensed" means an active Pro license or trial, or a paid legacy license (`fallback: true`). Expired or revoked trials are blocked even if the package is installed. This is a product gate, not a security boundary: every API already requires authentication, and free servers use the same APIs from the desktop app. | Provisional (commercial confirmation still needed) | Commercial sign-off on Pro gating. No-IP gating is Track C. |
| **D-22** (part) | Default authentication and session baseline | Session values are built: 15 min idle, 12 h absolute, rotation every 60 min with a 5 min grace period. All can be changed with env vars (section 4, B3 #4). | Built, needs sign-off (Project lead + IT) | Password length, lockout after 5 attempts with admin unlock, and staff MFA (B3 #1, #3, #6). |
| **D-03** (part) | Defaults for new links | New links default to **Only invited clients & teams** when no admin has saved a choice (`default_restrict_access` → true). Servers with a saved choice keep it. Quick Share follows the server default. Separately, an unset `default_link_access` now falls back to **external**, which needs port forwarding. | Built, needs sign-off (Project lead + IT + Sales) | Expiry and inactivity values. Treatment of old links. The external fallback (see open questions). |
| **D-05** | What is in the client workflow? | No new system. "Clients" are the existing share users and "Teams" are the existing groups (renamed). **The client-focused view (A3, A-07) is the projects-first restructure** (A4-1, A4-11 to A4-13): a project is the place where a client's files, links, Client Access, comments and activity come together. No separate per-client screen will be built; **A3 is complete**. | Built | None for A3. Review and approval status will show in the project when the C2 screens are built (C2 work). |
| **D-16 / D-20** | Priority tasks, labels and visual direction for the refresh | The A1 feedback was applied as a projects-first workflow and creative-team vocabulary (section 3), plus the shared design system (section 3, A5). | Built, needs sign-off (design leads + Track A developer) | The written direction and approval record (A1 task 4), the baseline step counts (A1 #2, needed for A6) and the validation method are not recorded. |
| **D-33** | How is the web UI packaged and served? | As recorded, with additions: six-distro repository packages, a version taken from the desktop app, automatic installation on entitled servers, and publication driven by the desktop release orchestrator (section 2, A2-8 to A2-11). | Built | First signed repository publication and live install on licensed Debian and Rocky servers. |
| **D-37** | How is the web UI split between tracks? | Kept. Stage 1 (A2) is done. Because both clients share one session store, B3's session rules (#4) were built together with A2 rather than later, so A7's integration work for session rules is mostly already done. | Built | A7 still covers two-step login in the browser and the review of Track C screens. |

---

## 2. A2: Browser foundation (Web UI Stage 1)

Docs: `docs/browser-foundation.md`, `docs/browser-handoff.md`, broadcaster `docs/web-package.md`, `docs/nginx-hardening.md`.

| # | Decision | Why | Status |
|---|---|---|---|
| A2-1 | The browser app is the **same renderer** as the desktop app. `src/renderer/ipc-web-shim.ts` provides `window.electron` when Electron is absent. Every IPC channel is either mapped, handled or rejected with guidance. | One codebase. Features behave the same on both clients. | Built |
| A2-2 | It is served at `/app/` by the **existing nginx**, behind `45flow-admin-allow.conf` (LAN/VPN only). No Caddy and no second web server. | Reuses the TLS, allowlist and upgrade paths that already exist. | Built |
| A2-3 | Browser sign-in uses an **httpOnly cookie session** (`POST /api/session`). The browser never holds a token or password. Writes carry `X-CSRF-Token`. `web-session.ts` wraps `fetch`, so existing calls needed no changes. The bearer-token sign-in used for one day (4 Nov) was removed once the B1 contract existed. | B-10. Keeps credentials out of JavaScript. | Built |
| A2-4 | "Remember password" is **deliberately not offered** in the browser. | A stored password in a browser defeats the cookie design. | Built |
| A2-5 | **One upload protocol** for desktop and browser: `src/shared/chunkedUpload.ts` (init → chunked PATCH → complete via `/api/local-upload`). The desktop reads chunks from disk; the browser reads them from a `File`. Closing the tab cancels an upload, after a confirmation prompt. | No duplicate upload logic to drift apart. | Built |
| A2-6 | Browser logs are kept **in the tab**: the newest 500 entries in `sessionStorage`, secrets redacted, shown as **Browser Logs** with a Download button. | There is no file system to write to, and logs must not leak secrets. | Built |
| A2-7 | Client-side transcoding is off in the browser. The server transcodes. The hint reads "Unavailable in the web view — the server will handle transcoding. Use 45Flow Desktop for local processing." | There is no local ffmpeg in a browser. | Built |
| A2-8 | `45flow-web` is a **separate static package** (tar.gz/deb/rpm, `all`/`noarch`) installed to `/opt/45drives/45flow-web`. It `Recommends` houston-broadcaster. Its version is the desktop app's `package.json` version, with pre-releases written as `1.2.0~beta.1`. Builds are reproducible (`SOURCE_DATE_EPOCH`). `/app/version.json` records the version, commit and build date. It ships only static files, with no Node or Electron. | D-33. The UI version always matches the desktop release. | Built |
| A2-9 | **Release flow:** the desktop release orchestrator dispatches `build-web-packages.yml` with the exact source SHA and version, then waits for build, signing and repository sync before any GitHub release step. The web workflow is dispatch-only and never publishes a GitHub release. Source drift (changed commit or version, dirty tree) stops the release. A Windows `stage` run does not publish web packages; `finalize` does. Web packages are not rolled back if a later GitHub upload fails. | Desktop and web versions cannot get out of sync. | Built; first live publication not yet done |
| A2-10 | **Default install:** the Broadcaster installs a *missing* `45flow-web` at startup, after license activation and every 15 minutes, but only for active licenses with update entitlement (active trials included). It runs in a transient `45flow-web-install` systemd unit so the Broadcaster service keeps `NoNewPrivileges`. Failures are logged and retried, and never fail license activation. It never upgrades or removes a package, and never adds repositories or signing keys. | Licensed customers get the UI without extra steps, and the service stays hardened. | Built; not yet verified live |
| A2-11 | Packaging steps on the build runners use POSIX shell (`scripts/web/ci-prepare.sh`) because the runner has no `node`. The packaging layout tests run locally and in CI, not inside rpm/deb builds. | Fixes for build failures on el8 and on the runner. | Built |
| A2-12 | **API docs:** the browser opens `/api-docs/` in a new tab, signed in by its cookie. The desktop app opens a sandboxed window (in-memory session, no preload) that sends its token in a header on docs requests only. | `/api-docs` now requires an administrator login (B1 #7). | Built |
| A2-13 | `WEB_APP_LICENSE_GATE=off` is a **lab-only** override that opens `/app/` on unlicensed servers without regenerating nginx. `make web-gate GATE=off` sets it. | Lets the lab test servers without a license. Remove it before production. | Built |

---

## 3. A3–A5: UI/UX refresh (started 6 Nov, ahead of the 9 Nov plan start)

### A3/A4: Workflow, navigation and vocabulary

Commit `31b1df6` ("per the A1 design feedback"), plus `d217b34`, `ddfeee0`, `82b6065`, `67cf33f`.

| # | Decision | Status |
|---|---|---|
| A4-1 | **Projects first.** The app always opens on Projects. Project Mode and its setting were removed. Create Link, Add Files and Client Access only appear inside a project. A new project opens immediately after it is created. "Links Without a Project" only appears when such links exist. | Built, needs sign-off |
| A4-2 | Activity Log and Settings moved to **icon buttons in the header** (AppShell). | Built |
| A4-3 | **Vocabulary:** Upload Files → **Add Files**; Review Copies → **Proxy Files**; Users/Groups → **Clients/Teams**; Manage Access → **Client Access**; View Logs → **Activity Log**; LAN/Internal → **Local Network**; invite-only → **Only invited clients & teams**. Tour text was rewritten to match. | Built, needs sign-off (D-16) |
| A4-4 | **Login:** one centred card with Login (username, password) above Server (discovered servers, manual address, advanced ports). The browser build shows only the login fields. | Built |
| A4-5 | **New Project:** pick a folder, or create one named after the project. A folder-space notice shows the ZFS pool, free space, a warning when the folder is off-pool or low on space, and where `.45flow` will live. It uses the new `GET /api/fs/space`. The check is advisory and does nothing on older servers. | Built |
| A4-6 | **Per-project artifact storage** (server): proxies and streams for files inside a project folder go to `<project>/.45flow/transcodes`. Other files keep the share-root `.45flow`. Lookup order is project, then share root, then legacy locations. Nothing is moved or deleted. Client upload targets are limited to the share root or a known project's `.45flow`. Upgrade note: proxy disk usage now lands on the project's pool. | Built, needs sign-off (changes where disk space is used) |
| A4-7 | **Create Link:** a full-width "Files to share" picker. Selecting no files creates an upload-only link. Uploads collapse to one "Let client upload to" row. Share Externally is listed before Share Locally. A summary line states the link type. The inline new-project dialog was removed; projects are created on Projects. | Built |
| A4-8 | **Quick Share:** outside a project, the user must choose an active project before choosing a folder. | Built |
| A4-9 | **Defaults:** invite-only access is listed first and is the default (D-03). The setting is labelled "recommended". The expiry help says expired links stop working but the files stay on the server. The share viewer shows SMPTE timecode unless the viewer turns it off. | Built, needs sign-off |
| A4-10 | **Transfer dock:** background polling opens the dock only when it finds new work, and never reopens it after the user closes it. | Built |
| A4-11 | **Link Details:** a status header (Active/Expired/Disabled, Copy link, who can open it, expiry, created date, project) and tabs: Overview, Files, Activity, Versions. **Edit** is one form grouped like Settings. Invitation changes are marked (New, Role changed, Will be removed, with Undo) and only apply on **Save & close**. A blank password keeps the existing one. Closing with unsaved changes asks for confirmation. | Built |
| A4-12 | **Comments Review:** comments are grouped by file, with threaded replies. Filters cover text, person, status, file, category (including none) and version (including none). Bulk Resolve, Reopen and Set category act only on the selected comments that the current filters still show. Delete asks for confirmation and says when replies and drawings will go too. | Built |
| A4-13 | **Client Access roles** use four permissions: View, Comment, Download and Upload, each with a one-line description. Avatars use initials and ignore punctuation such as "(Editor)". | Built |

### A5: Design system

Docs: `docs/design-system.md`, `docs/track-c-ui-guide.md`. Commits `81170cb`, `9a635c9`, broadcaster `68aa0aa`.

| # | Decision | Why | Status |
|---|---|---|---|
| A5-1 | `style.css` is split into ordered files (tokens, themes, houston-overrides, app, components, utilities). The compiled CSS was confirmed identical to the old output before any new rules were added. | Structure without visual regressions. | Built |
| A5-2 | **Semantic tokens do not change with the theme.** Themes set only primary, secondary and brand colours, never danger, warning, dismiss or notice colours. | A red theme must never make a danger action look primary. | Built |
| A5-3 | The pieces live in `src/renderer/ui` (`FlowButton`, `FlowField`, `FlowCard`, `FlowModal`, `FlowNotice`, `FlowChip`, `FlowEmpty`, `FlowSwitch`). They reuse houston CSS classes but do not import `houston-common-ui`. 45Flow-only styles stay out of houston-common-css. | Testable in isolation. Other Houston apps are not affected. | Built |
| A5-4 | **The button variant follows what the button does, not its colour.** Close, Cancel, Back to… and Log out use `dismiss` (fixed tonal red, never solid). A wizard's Back is `secondary`. Remove, Delete, Disable and Stop use `danger` (houston rose). Approve uses `success`. Disable Project became a danger action. | Consistent meaning in every theme. | Built, needs sign-off (visible change) |
| A5-5 | **Every dialog uses `FlowModal`.** Escape, backdrop and Close all close it; `busy` blocks all three. Modals stack in the order they open, keep focus inside and return it to the trigger on close. No hand-set z-index; named layers only. Modal widths snap to a shared size scale. | Fixes stacking bugs and gives keyboard and screen-reader support. | Built |
| A5-6 | **A guard enforces the system.** `yarn check:ui` runs in `yarn test` and rejects `btn-delete`, `ss-chip`, raw status colours, `z-[N]`, hand-built `fixed inset-0` overlays, and Close/Cancel buttons without `dismiss`. Exceptions need a `flow-ui-allow: <reason>` comment. | Keeps Track C and later work consistent without manual policing. | Built |
| A5-7 | **The share player mirrors the system** (`studiosharevideoplayer/src/styles/flow-*.css`, `src/ui/*`), with the same API minus `FlowCard`, its own guard, and Tailwind compiled through Vite. Token or prop changes must be made in both codebases by hand. | Clients and staff see the same status words and colours. | Built |
| A5-8 | **Track C screen placement and status words:** client and reviewer actions (Approve this version, Request changes, resolve, annotate) go in the player. Team views (decisions, history, reports, email dialogs) go in the app. Labels: Awaiting approval (`info`), Approved (`success`), Changes requested (`warning`), Superseded (`muted`). A resolved comment is `muted` with a ✓, **never `success`**. | Resolving every comment must never look like an approval. | Built, needs sign-off (Track C owner) |
| A5-9 | Layout rules: a switch for a yes/no setting; radio-style buttons when both options are named (Local Network / Internet). Use one bordered list, never a box inside a box. Records use `flow-table`. Settings and details use `flow-group` rows. | Consistent density across dialogs. | Built |
| A5-10 | **The refresh ships as test builds first (A5 #5).** The A3–A5 refresh is released once the remaining work is implemented and tested. Screens merged in from Track C without the design-system pass are restyled before release. | One tested release instead of several back-to-back ones. | Decided |

### Other UX change made during A5 (not in a plan thread)

- **Share player keyboard (broadcaster `6222d70`):** YouTube-style controls. Space toggles play/pause; ←/→ skip 5 s; `,` `.` and Shift+←/→ step one frame and pause. When metadata has no frame rate, it is measured during playback (30 fps fallback). Keys pressed inside video.js controls are handled. Ctrl, Alt and Cmd shortcuts and text inputs are left alone.

---

## 4. Track B work done so far

### B1: Server hardening and contracts

Docs: broadcaster `docs/browser-session-contract.md`, `docs/hardening-evidence.md`, `docs/nginx-hardening.md`.

| # | Decision | Status |
|---|---|---|
| B1-1 | **Browser session contract published** (B1 #2, B-10). Broadcaster `docs/*.md` is git-ignored by default; contract, hardening and packaging docs are committed through `!docs/<name>.md` whitelist lines, and any new doc needs one. | Built, needs Track B owner sign-off |
| B1-2 | **Admin allowlist defaults:** loopback, RFC 1918, CGNAT/Tailscale `100.64.0.0/10`, IPv6 ULA and link-local, then `deny all`. It is a package config file (conffile / `%config(noreplace)`), so customer edits survive upgrades and bootstrap never rewrites it. nginx uses the connection peer, never `X-Forwarded-For`. | Built |
| B1-3 | **Production defaults (B1 #7, B-07):** TLS 1.2/1.3 only with ECDHE AES-GCM/CHACHA20 and no session tickets. HSTS, nosniff, Referrer-Policy and SAMEORIGIN on every HTTPS response. `server_tokens off`. HTTP redirects to HTTPS (ACME challenges excepted). CSP `connect-src` limited to `'self'`, `https:` and `wss:`. A strict CSP on `/app/`, which repeats the security headers because nginx drops inherited `add_header`. Express trusts only the local nginx as a proxy. `UNSAFE_NO_VERIFY` and `AUTH_MODE=open` stop the service from starting in production. No default admin: PAM only, and the env fallback needs `ALLOW_ENV_AUTH=1`. Generic errors with a request ID. | Built |
| B1-4 | `/api-docs` and `/api-docs.json` need an **administrator login** on both 443 and 9095. | Built |
| B1-5 | `/logs` needs an **administrator login plus a direct LAN connection** (B1 #6). houston-client-manager signs in first. | Built |
| B1-6 | Share pages no longer allow `'unsafe-eval'`. PDF and spreadsheet previews were checked in a browser. | Built |
| B1-7 | **Port 9095 stays on the LAN for now.** Bootstrap opens it to RFC 1918 only, every route on it needs a login, and the docs say never to forward it. `HOST=127.0.0.1` is available as an opt-in. Making `127.0.0.1` the default is a planned follow-up. | Built, needs sign-off |
| B1-8 | **Hardening evidence approach:** each default has a row in `hardening-evidence.md` (where it is set, the automated test, the live check). `scripts/security-smoke.sh <host>` is re-run before every release (S-08) and the results are recorded there. | Built |
| B1-9 | **Accepted gaps:** self-signed certificate by default (Let's Encrypt is the customer's choice in Settings). Web security is off only in `yarn dev` builds. | Built, needs sign-off |
| B1-10 | **Credential-handling contract (B1 #1, B-09), built by Track C as its mail prerequisite.** One server-owned store with `smtp` and `noip` namespaces. Secrets are encrypted with AES-256-GCM; only ciphertext reaches the database. The key lives in a root-only file apart from the database. Rotation keeps older key versions so older backups still decrypt, and the key file is backed up separately. The admin API never returns a secret, and "store unavailable" is reported separately from "not configured". Email is the first consumer. Doc: broadcaster `docs/credential-boundary.md`. | Built, needs sign-off |

Not done in B1: #4, #5, #9, #10.

### B2 #1: Desktop over HTTPS (done early)

| # | Decision | Status |
|---|---|---|
| B2-1 | The desktop app sends sign-in, every API call, uploads and the WebSocket **through nginx over HTTPS**. There is **no HTTP fallback**. | Built |
| B2-2 | **Certificate trust:** a certificate is accepted only if it matches what nginx presents over the app's SSH connection. It is then pinned (`src/main/serverTrust.ts`). | Built |
| B2-3 | Saved `http://<server>:9095` connections are upgraded at startup. 9095 is used only for discovery, health and setup, without credentials. | Built |
| B2-4 | Main-process HTTP must use Electron `net.fetch` / `net.request`, never Node `fetch`/`http(s)`, so that the same certificate check applies. | Built |
| B2-5 | nginx streams `/api/local-upload/` and `/api/ingest/transcode-upload-file` to the Broadcaster **unbuffered**, with 24 h timeouts, because transcode outputs can exceed 2 GiB. | Built |

Remaining: B2 #2 onward.

### B3 #4: Session rules (built with A2)

| # | Decision | Status |
|---|---|---|
| B3-1 | **One session store** for browser and desktop. The desktop JWT carries `sid`/`jti`; the server-side session decides whether it can still be used. | Built |
| B3-2 | Defaults: idle 15 min (sliding), absolute 12 h (never extended), rotation every 60 min with a 5 min grace period. All configurable (`SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `SESSION_ROTATE_MINUTES`, `SESSION_ROTATION_GRACE_SECONDS`). | Built, needs sign-off (D-22) |
| B3-3 | Cookie `__Host-45flow_session`: `HttpOnly; Secure; SameSite=Strict`, no Domain, no expiry. Value is 256-bit random; only its SHA-256 hash is stored. Sign-in over plain HTTP is refused. | Built |
| B3-4 | CSRF token = `HMAC(JWT_SECRET, "csrf:" + idHash)`, so nothing is stored and it survives restarts, plus a same-host `Origin` check. Rotating `JWT_SECRET` invalidates CSRF tokens until pages reload. | Built |
| B3-5 | Sessions are kept in memory and written through to SQLite (`auth_sessions`). **A restart or update does not sign anyone out.** `last_seen_at` is written at most once a minute, so a crash can lose up to a minute of idle time. | Built |
| B3-6 | **Background policy:** requests marked `X-Background-Request: 1` (progress polling) need a valid session but do not extend it. A request counts when it starts and when it ends, so long transfers do not idle out. Open WebSockets and streams count only when they connect. The page sends keepalives only while the user is active (at most once a minute) and shows a "Stay signed in" prompt about two minutes before expiry. | Built |
| B3-7 | Revocation takes effect on the next request. In-flight responses are **not** cut off. WebSockets close within 30 s. The desktop app defers token rotation while a transfer runs. | Built, needs sign-off |
| B3-8 | **Older desktop tokens** (no `sid`) keep working until their own 12 h expiry. `REQUIRE_SESSION_TOKENS=1` refuses them. This is the upgrade path for B3 #6. | Built, needs sign-off |
| B3-9 | No session credential ever goes in a URL. The only two query-string tokens (FFmpeg source stream, connection probe) are purpose-scoped and cannot log in. Access, browser and desktop logs redact token-like parameters. | Built |
| B3-10 | Failed sign-ins are rate-limited to **10 per 5 minutes per IP and username** for now. Lockout with admin unlock is deferred to B3 #3. | Built (interim) |
| B3-11 | A desktop app with a saved password re-authenticates silently after expiry. This counts as the user's opt-in. | Built, needs sign-off |

### B3 #9: Approval permissions (part, built in C2)

| # | Decision | Status |
|---|---|---|
| B3-12 | Review decisions (approve, request changes, reject) are accepted only from the **designated approver** for the link, identified by the server-verified identity, never by anything the request claims. Open or anonymous links can never record a decision. Staff set the approver per link. Decisions on a replaced version are refused; history for older versions stays readable. | Built, needs sign-off |

---

## 5. Open questions raised during development

1. **External link default.** An unset `default_link_access` now means "external", which needs port forwarding. A new server that hasn't set this up may create links that don't open. Choose: keep external, revert to local, or make the setup flow ask.
2. **A1 record.** The design direction was implemented without a written direction, an approval record or the baseline step counts. A6 needs the baseline (A-12).
3. ~~**A3 client-focused view.**~~ Resolved: the projects-first restructure is the client view; no separate screen. A3 is complete (D-05).
4. **Access removal.** Removing a user's access does not yet revoke their sessions (B3 #5, B-17).
5. **Port 9095 default.** When to make `HOST=127.0.0.1` the default (B1-7).
6. **First live checks still pending:** repository publication and install of `45flow-web`, the signed-in browser checklist in Safari and Firefox, and a full desktop sign-in, upload and transcode against an updated server.
