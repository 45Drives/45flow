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
  - Uploads may show 100% while the server finishes malware checks. Wait for the
    final result before closing the app; an unavailable scanner is not a passed scan.
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

Saved login credentials use your operating system's protected storage:
Keychain on macOS, DPAPI on Windows, or an unlocked GNOME Keyring/Secret Service
or KWallet on Linux.

**Remember password securely** is optional; leave it unchecked if you do not
want the app to retain your password for automatic reauthentication. Logging
out or removing a connection clears its saved login credentials.

If protected storage is unavailable, the app warns you and keeps credentials
only for the current session. You will need to log in again after closing the
app. On Linux, enable/unlock a supported keyring to retain your login.

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

- Updated servers quarantine uploads and perform malware checks; check the
  reported result because a scan may be skipped if the scanner is unavailable
- Links support expiration, password protection, and role-restricted access
- HTTPS required for external access
- Administrative APIs require authentication; public share actions enforce the
  link's access rules
- Public HTTPS allows recipient sharing routes; administrative HTTPS routes
  are restricted to trusted networks and still require authentication

Most users can leave **Admin Networks** at its defaults. Server administrators
can adjust which LAN/VPN addresses may reach administrative HTTPS routes under
**Settings → Admin Networks**. This does not change public share-link access or
replace firewall rules for the direct backend port.
See [Admin Networks in the user guide](docs/45Flow_User_Guide.md#admin-networks).

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

Desktop packages include the compiled main process, compiled renderer, static
runtime resources, production dependencies, package metadata and license.
Documentation, QA results, source files and release/build scripts are not
bundled. The in-app user guide opens the online documentation.

## License

See [LICENSE](LICENSE).
