<p align="center">
  <img src="assets/logos/og-card-1200x630.png" alt="45Flow" width="600" />
</p>

# 45Flow

45Flow is a secure file collaboration and transfer platform designed for media-heavy workflows. It combines an Electron desktop client with a Linux-based server service (`houston-broadcaster`) to provide controlled file sharing, upload portals, and video review — all managed from a single dashboard.

> **📖 Full User Guide:** See [docs/45Flow_User_Guide.md](docs/45Flow_User_Guide.md) for complete step-by-step instructions with screenshots.

---

## Key Features

- **Share files via secure links** — Generate expiring, access-controlled links for viewing, downloading, and commenting on files
- **Upload portals** — Create links that let external collaborators upload files directly to your server
- **Local uploads** — Transfer files from your workstation to the server with optional review copy generation and watermarking
  - On servers advertising local-upload scanning, the upload panel, Quick Share,
    and transfer dock show a queued/running malware-check message after transfer.
    Transfer can read 100% while server checks are pending; success or failure
    follows the completion response. The dock retains the reported scan result,
    including scanner-unavailable skips. Older servers show generic finalization,
    without claiming a scan passed. Available for both free and Pro connections.
- **Client-side transcoding** — Process videos on your workstation before upload using local CPU/GPU, reducing server load and speeding up review copy availability
- **Video review with timecoded comments** — Browser-based HLS player with threaded, frame-accurate commenting
- **Role-based access control** — System and custom roles (View, Comment, Download, Upload) enforced per link
- **review copy generation & watermarking** — Generate 720p/1080p review copies and apply watermark overlays to protect original media
- **Link management dashboard** — Search, filter, edit, disable, and monitor all links from one place
- **Auto-discovery** — Desktop client finds servers automatically via mDNS/Bonjour

---

## Supported Platforms

| Component | Platforms |
|-----------|----------|
| **Desktop Client** | macOS (Intel & Apple Silicon), Windows (x64), Linux (DEB & RPM) |
| **Server** | Linux — Rocky/RHEL 8+, Ubuntu 20.04+ |
| **Storage** | ZFS-backed recommended |

---

## Quick Start

### 1. Install the Desktop Client

Download the latest release from the [Releases page](https://github.com/45Drives/45flow/releases) and install:

| OS | File | Install |
|----|------|---------|
| macOS| `*-mac-universal.dmg` | Drag to Applications |
| Windows | `*-win-x64.exe` | Run installer |
| Ubuntu/Debian | `*-linux-amd64.deb` | `sudo apt install ./45flow-*.deb` |
| Rocky/RHEL | `*-linux-x86_64.rpm` | `sudo dnf install ./45flow-*.rpm` |

### 2. Connect to Your Server

1. Open 45Flow — your server should appear automatically if `houston-broadcaster` is running.
2. If not, enter the server IP manually.
3. Log in with your server credentials.

### 3. Start Sharing

From the Dashboard, use the three main actions:

| Action | What It Does |
|--------|-------------|
| **New File Share Link** | Select files on the server → configure access → generate a link |
| **Upload Files Locally** | Pick local files → choose destination → upload to server |
| **New Upload Link** | Pick a destination folder → configure access → generate an upload portal link |

For detailed walkthroughs of every feature, see the [Full User Guide](docs/45Flow_User_Guide.md).

### Secure login storage

The desktop encrypts saved admin tokens and opt-in remembered passwords using
Electron `safeStorage` in the main process. Connection metadata (server address,
username and ports) remains in localStorage; credentials do not. Existing
plaintext connection and legacy-session credentials are removed from browser
storage on the first launch of this release and migrated to encrypted storage
where available. Removing old entries does not securely erase historical
browser database pages, backups, or filesystem snapshots.

Tokens resume login until they expire. The optional **Remember password securely**
setting also permits reauthentication after token expiry. Leave it unchecked
to avoid retaining your administrator password. Logging out clears both saved
credentials for that connection; removing a connection clears them too.

Link and project lists use the same expiry handling as other authenticated
actions. If remembered-password reauthentication is unavailable or rejected,
the app clears that connection's credentials and shows a **Login token expired**
notification. An expired active connection returns to server selection to log
in again; expiry on another server does not interrupt the active connection.

- **macOS:** uses Keychain.
- **Windows:** uses DPAPI, tied to your Windows account.
- **Linux:** requires an available, unlocked GNOME Keyring/Secret Service or
  KWallet. A keyring unlocked by your desktop login permits automatic app login.
  Installing `libsecret` alone is not sufficient; a running secret service and
  an unlocked keyring are required.

If secure storage is unavailable, credentials stay in memory for the current
app session only and the app displays a warning. Enable/unlock a supported
keyring before restarting to enable persistent login. Electron's Linux
`basic_text` fallback is deliberately rejected; no machine-ID-derived or
application-bundled encryption key is substituted. Encryption at rest does not
protect against a compromised running desktop, account, or renderer.

These fixes apply to free and Pro connections alike, without requiring server
API changes. They take effect after updating the desktop; installations without
auto-update must update manually.

Credential regression tests:

```sh
yarn test src/main/secureTokens.test.js src/renderer/composables/useConnections.test.js src/renderer/composables/useApi.test.js
```

For real native encryption and process-restart checks on Linux, Windows and
macOS, run `node scripts/test-security-hygiene.cjs --scope desktop`.
Linux defaults to KWallet 5, GNOME Libsecret and the rejected `basic_text`
fallback. See the [automated hygiene QA guide](docs/security-hygiene-qa.md)
for setup, isolated server checks, JSON reports and remaining deployment tests.

Tests exercise encryption through an injected provider, migration, memory-only
fallback, IPC authorization, token replacement, logout and connection removal.
Release QA must additionally verify native keychain behavior on each OS:
log in, fully quit/relaunch, confirm session resumption, then log out and
relaunch to confirm credentials are gone. On Linux, repeat without an available
keyring (and with `--password-store=basic`): a warning must appear, no credential
file may be written, and login must be required after fully quitting.

---

## Architecture

```
┌─────────────────────┐         SSH + API (9095)         ┌──────────────────────────┐
│   45Flow Desktop    │◄────────────────────────────────►│   houston-broadcaster    │
│   (Electron App)    │                                  │   (Node.js service)      │
└─────────────────────┘                                  └──────────┬───────────────┘
                                                                    │
                                                         ┌──────────▼───────────────┐
                                                         │   ZFS Storage / Files    │
                                                         └──────────┬───────────────┘
                                                                    │
┌─────────────────────┐         HTTPS (443)              ┌──────────▼───────────────┐
│   Browser (Viewer)  │◄────────────────────────────────►│   Video Player / Upload  │
│   Share recipients  │                                  │   (Vue.js SPA)           │
└─────────────────────┘                                  └──────────────────────────┘
```

- **Desktop Client** — Electron app for connecting, uploading, and managing links
- **houston-broadcaster** — Node.js server handling API, file serving, transcoding, and link validation
- **Video Player** — Browser-based Vue.js app served to share/upload link recipients

---

## Port Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (client ↔ server) |
| 9095 | TCP | API (client ↔ server) |
| 443 | TCP | HTTPS — share/upload links (must be forwarded for external sharing) |

---

## Security

- All uploads quarantined and malware-scanned before acceptance
- Links support expiration, password protection, and role-restricted access
- HTTPS required for external access
- Server validates all API requests with JWT authentication

---

## Development

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build for production
yarn build
```

## License

See [LICENSE](LICENSE).

## nginx admin access

Public HTTPS exposes the share routes; admin routes require a LAN or VPN connection. Customize trusted networks in /etc/nginx/45flow-admin-allow.conf. See [nginx hardening](docs/nginx-hardening.md) for the defaults and deployment verification steps.
