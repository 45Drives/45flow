# Automated token, cookie and key hygiene QA

Run from this client checkout with **Node.js 22+** and the repository's
dependencies already restored. This is a source/native integration validator,
not a comprehensive penetration test or a substitute for deployment QA.

## Desktop credential-storage behavior

The desktop uses Electron `safeStorage` in the main process to encrypt saved
admin tokens and opt-in remembered passwords. Server addresses, usernames and
ports remain in localStorage; credentials do not. On upgrade, existing plaintext
connection and legacy-session credentials are removed from browser storage and
migrated to encrypted storage where available. This does not securely erase
historical browser database pages, backups or filesystem snapshots.

Tokens resume login until expiry. **Remember password securely** permits
reauthentication after expiry. If that is unavailable or rejected, the app clears
the connection's credentials and asks for login again. Expiry on an inactive
connection does not interrupt the active connection. Logout and connection
removal clear that connection's saved credentials.

macOS uses Keychain; Windows uses account-bound DPAPI. Linux requires a running,
available and unlocked Secret Service or KWallet; installing `libsecret` alone
is insufficient. If protected storage is unavailable, credentials remain in
memory only and the app warns the user. Electron's Linux `basic_text` fallback
is rejected; no machine-ID-derived or bundled encryption key is substituted.
Encryption at rest does not protect a compromised running desktop, OS account,
or renderer.

This behavior applies to free and Pro connections after updating the desktop,
without requiring server API changes. Installations without auto-update need
a manual desktop update.

Focused source regressions:

```sh
yarn test src/main/secureTokens.test.js src/renderer/composables/useConnections.test.js src/renderer/composables/useApi.test.js
```

These tests cover migration, memory-only fallback, IPC authorization, token
replacement, logout and removal using injected encryption providers. Use the
native runner below and the deployment checks later in this guide for actual
OS storage, process-restart, reboot and cross-user validation.

## Admin Networks regression and live checks

With dependencies restored in this client checkout and the sibling
`houston-broadcaster` checkout:

```sh
yarn test:admin-networks
```

Set `HOUSTON_BROADCASTER_DIR` if the server checkout is elsewhere. Desktop
SSH/certificate regressions use local SSH/TLS fixtures and require `ssh-keygen`
and `openssl`; they do not contact a deployed server. Coverage includes client
behavior, nginx configuration, simulated failures and rollback.

Append live-runner options to test a deployment; run
`yarn test:admin-networks --help` for usage. The runner supports LAN/VPN or public
HTTPS addresses, custom ports and custom certificate authorities. Default live
checks do not write the policy; disruptive lab writes require explicit opt-in.
Supply tokens using the documented environment/file mechanism, not command
arguments or shared reports.

LAN checks do not prove external filtering or ACME reachability. Run external
checks from a genuinely external source and keep unavailable checks marked
skipped. See `docs/nginx-admin-cidrs.md` in the server checkout for deployment
prerequisites, live examples and recovery instructions.

The desktop routes this panel through nginx HTTPS, even if ordinary API traffic
uses the backend port. It verifies the HTTPS certificate over SSH using the
saved key or agent and checks OpenSSH known hosts (including hashed entries),
Unix system known hosts, or its remembered identities. Unknown SSH identities
need explicit fingerprint approval. This certificate verification is specific
to the panel; it does not change all existing SSH operations. Browser clients
still use normal browser certificate validation.

Policy confirmation requires a connection through the reloaded nginx rules;
the desktop retries old-worker rejections until the deadline. The server owns
rollback and persists recovery state across interruption. Tests must distinguish
successful confirmation, automatic restoration and a recovery failure needing
console/SSH access.

## Linux: all three backends plus server regressions

Run in your ordinary graphical desktop login, **not through sudo or a bare SSH
session**:

```sh
node scripts/test-security-hygiene.cjs --server-repo ../houston-broadcaster
```

The default Linux matrix is:

| Requested backend | Required actual Electron backend | Expected result |
| --- | --- | --- |
| `kwallet5` | `kwallet5` | Encrypted credentials survive real process restarts |
| `gnome-libsecret` | `gnome_libsecret` | Encrypted credentials survive real process restarts |
| `basic` | `basic_text` | Application rejects persistence; credentials stay in memory |

You do **not** need to log out of KDE to exercise GNOME Libsecret. Its Secret
Service must actually be installed, running/activatable on your user D-Bus
session, and have a usable unlocked collection. Forcing the flag does not
install or provision GNOME Keyring. Another service implementing Secret Service
may own that D-Bus interface; `gnome_libsecret` alone proves use of Electron's
Libsecret backend, not which daemon owns it. The runner additionally uses
`busctl` and `/proc` to verify that `org.freedesktop.secrets` belongs to
`gnome-keyring-daemon`. If another service owns it, or its owner cannot be
identified, GNOME Keyring certification is **BLOCKED**, not passed. This
requires `busctl` (normally supplied by systemd). Do not stop a live service
used by other applications.

KWallet may display an unlock/access prompt. GNOME Keyring may request an
unlock or creation of a collection. Permit the isolated **45Flow Hygiene QA**
test application only if the prompt is expected. A denied/unavailable service
is reported as blocked or failed, never silently replaced with a passing mock.
If a keyring prompt needs more time:

```sh
node scripts/test-security-hygiene.cjs --timeout 180
```

Independent reruns:

```sh
node scripts/test-security-hygiene.cjs --scope desktop --linux-backends kwallet5
node scripts/test-security-hygiene.cjs --scope desktop --linux-backends gnome-libsecret
node scripts/test-security-hygiene.cjs --scope desktop --linux-backends basic
```

Optional KDE 6 coverage:

```sh
node scripts/test-security-hygiene.cjs --scope desktop --linux-backends kwallet6
```

Server tests require the updated companion checkout, its installed dependencies,
Linux, Bash and OpenSSL. The runner does not install anything or invoke a real
Certbot command, nginx reload, bootstrap deployment or system-service command.

## Windows

In PowerShell, from the client checkout as your regular user:

```powershell
node scripts/test-security-hygiene.cjs --scope desktop
```

This uses real Electron `safeStorage`/DPAPI and separate Electron processes.
Do not use WSL for the Windows run; that tests Linux instead.
POSIX mode-bit checks are not applied on Windows; this harness does not certify
Windows ACL or cross-user isolation.

Run the server scope separately on a Linux machine containing both checkouts:

```sh
node scripts/test-security-hygiene.cjs --scope server --server-repo ../houston-broadcaster
```

Running the default `all` scope on Windows deliberately reports server checks
as **BLOCKED**, rather than pretending Linux bootstrap tests ran.

## macOS

In Terminal, from the client checkout as your regular user:

```sh
node scripts/test-security-hygiene.cjs --scope desktop
```

This uses actual Electron/Keychain access. Accept the expected **45Flow Hygiene
QA** Keychain prompt if one appears. Repeat on each supported architecture using
its native Node/Electron dependencies; the report records the process architecture.

Run the Linux server scope separately:

```sh
node scripts/test-security-hygiene.cjs --scope server --server-repo ../houston-broadcaster
```

The default `all` scope on macOS reports Linux server tests as **BLOCKED**.

## What runs

### Desktop source regression suite

Runs the existing credential store, migration and API authentication tests.
These cover input validation, storage failures, synthetic locked-keyring
behavior, legacy-only and stale migration, mocked token expiry/reauthentication,
and authentication/logout races. They are identified as source tests; fake
HTTP or encryption providers are not claimed as live platform verification.

### Native integration matrix

For every requested backend the runner bundles the **actual production**
credential store, preload and connection composable into an isolated Electron
test application. It does not copy or reimplement the encryption behavior.
Each of these phases runs in a **new operating-system process**, sharing only
the backend-specific temporary test profile:

1. Seed synthetic old-style localStorage entries.
2. Migrate; verify both browser-storage surfaces are scrubbed and the in-memory
   token/password are usable.
3. Restart; verify encrypted restoration (or loss in `basic_text` mode), then
   replace the token and opt out of remembering the password.
4. Restart; verify the replacement token and password opt-out, create another
   connection, then explicitly clear the first connection's credentials.
5. Restart; verify logout stayed effective and the second connection was not
   cleared accidentally; remove the second connection.
6. Restart; verify no removed/logged-out credentials return.

Checks also cover expected ciphertext files, no synthetic secret in ciphertext,
Unix permissions, real native rejection of corrupt ciphertext, path traversal,
and real production IPC rejection after navigating away from the trusted app.
The memory-only warning is checked on the real composable state; visual rendering
of the full dashboard/settings UI is not exercised.

Migration deliberately creates plaintext **synthetic** credentials in the
temporary profile to model the old release. Removing localStorage entries is
not a secure erase of historical LevelDB pages or backups.

### Server source regressions

Runs the companion repository's focused suites:

- Cookie flags, signed expiry, link status/access and trusted proxy policy.
- Self-signed SAN changes and forced regeneration with real OpenSSL key
  continuity checks.
- Invalid/missing/mismatched keys and certificate replacement failures.
- The real bootstrap certificate function extracted into an isolated Bash test.
- Certbot arguments and existing renewal-configuration migration using fixtures
  and mocked external commands.

No real server credentials, link passwords or admin JWTs are needed.

## Safety and data

- Uses fresh temporary profiles, never your normal app profile.
- Blocks HTTP(S) and WebSocket requests from the native test renderer.
- Does not pass synthetic secrets on command lines or write them into reports.
- Does not manipulate your wallet/keychain settings, launch a keyring daemon
  explicitly, or use `--no-sandbox`. Native OS services may activate normally
  when Electron requests their APIs.
- Temporary files/profiles are deleted on normal completion. If the runner or
  workstation is forcibly terminated, its `45flow-hygiene-qa-*` temporary
  directory may remain; remove only that specific test directory after ensuring
  its helper process has exited.
- Electron may leave an OS keychain/wallet encryption-key entry for **45Flow
  Hygiene QA**. That is an OS-managed test encryption key, not a saved admin
  credential. The runner does not delete keyring entries or risk touching
  production 45Flow keys.
- A timeout kills only the helper started by the runner; it never stops the
  regular 45Flow app or any keyring service.

## Results and exit codes

The console summarizes each group. Detailed checks, actual backend names,
blocked reasons and remaining manual coverage are written to a new JSON report:

```text
qa-results/security-hygiene-<timestamp>.json
```

That directory is gitignored. To choose a report filename:

```sh
node scripts/test-security-hygiene.cjs --scope desktop --output ./qa-results/linux-desktop.json
```

Existing reports are never overwritten.

### Native Electron exits before reporting (including macOS)

Failure reports include `diagnostics`: the exit code, termination signal,
spawn error code (for example `ENOENT`/`EACCES`), last startup stage, and bounded
sanitized stdout/stderr. The report also records the host OS release; once the
JS entry point is reached it records Electron's version and architecture.
Synthetic credential canaries and the home/test-temporary paths are redacted.
Review diagnostic text before sharing it, since OS messages can include other
machine-specific information.

If the stage is `Before the Electron QA entry point`, Electron exited before
the native test code could run. The output may identify an OS compatibility,
loader/signature, architecture or startup problem; do not assume it is a
Keychain failure. No result is treated as a pass and no sandbox/signature bypass
is applied. Rerun the updated runner on the affected machine:

```sh
node scripts/test-security-hygiene.cjs --scope desktop
```

Use the failing phase's `diagnostics` to decide the next fix. A longer timeout
only helps if the process actually timed out waiting for an OS prompt.

| Exit | Meaning |
| --- | --- |
| `0` | All selected automated groups passed |
| `1` | A test/runner failed, an argument was invalid, or report creation failed |
| `2` | Required backend/environment/dependencies unavailable or timed out |

Treat an `all` report with blocked groups as incomplete. A successful
desktop-only report is not a server certificate/cookie sign-off.

## Still required for release/deployment sign-off

### Project phase handoff

This thread is an implementation phase, not a release. The automated reports
reviewed on 2026-10-26 passed for Linux x64 (KWallet 5, verified GNOME Keyring
and rejected `basic_text` persistence), Windows x64 (DPAPI), macOS ARM64
(Keychain), and the isolated Linux server regression suites.

The following checks are deliberately deferred to the project's full
testing/validation phase. They are not prerequisites for closing this
implementation thread, and must not be represented as already passed.
No new signed package or publication is required solely to close this thread.

Full validation should use the final release-candidate builds and server
deployment, rerun the automated runner, and record PASS / FAIL / NOT EXERCISED
with build versions and sanitized evidence:

- [ ] On each supported OS/architecture, install the release candidate using
  the normal signing/package-verification process and test in-place upgrade.
- [ ] On each OS, verify login persists after full app exit and reboot, and
  explicit logout remains effective after restart.
- [ ] On each OS, test copied-profile isolation between disposable OS accounts.
- [ ] On Linux and macOS, exercise genuinely locked/denied keyring access,
  visible failure/memory-only behavior and recovery after unlocking.
- [ ] On the lab deployment, test live token expiry/reauthentication and
  licensed/unlicensed compatibility.
- [ ] Through live nginx HTTPS, inspect cookie attributes and test browser
  session behavior, link expiry/disablement and the independent cookie expiry
  cap. Browser session restoration may preserve a session cookie.
- [ ] On the lab server, verify SAN changes and forced self-signed regeneration
  preserve SPKI, and that a fresh HTTPS connection receives the new certificate.
- [ ] On a dedicated lab ACME lineage, verify an actual renewal preserves SPKI
  and the deployment hook serves the renewed certificate; a dry-run alone is
  insufficient.

Live server checks need not be repeated per desktop OS, except where browser
coverage or platform-specific behavior warrants it. macOS Intel and any other
release architectures not covered by the recorded runs remain unverified.

These are explicitly listed as `notAutomated` in every report:

- Installed, signed application identity/Keychain authorization, OS reboot and
  real cross-user DPAPI/Keychain isolation.
- Real denied/locked secret-service access, distinct from forced `basic_text`.
- Live server password reauthentication and the licensed/unlicensed deployment
  matrix.
- Actual nginx HTTPS `Set-Cookie` headers, recipient browser session restoration
  and deployed link expiry/disablement.
- Real Certbot/ACME renewal, live certificate installation/reload and deployed
  SPKI continuity. A dry-run alone does not prove deployed-key continuity.

Those require deployment details, authorization to mutate a lab server and/or
OS interactions. The runner deliberately does not turn these into fake passes
or renew real certificates just to shorten a QA run.

## Runner self-tests

```sh
yarn test scripts/hygiene/runner.test.js
```
