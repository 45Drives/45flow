# 45Flow

45Flow is a secure file collaboration and transfer platform designed for media-heavy workflows. It combines an Electron desktop client with a Linux-based server service (`houston-broadcaster`) to provide controlled file sharing, upload portals, and video review — all managed from a single dashboard.

> **📖 Full User Guide:** See [docs/45Flow_User_Guide.md](docs/45Flow_User_Guide.md) for complete step-by-step instructions with screenshots.

---

## Key Features

- **Share files via secure links** — Generate expiring, access-controlled links for viewing, downloading, and commenting on files
- **Upload portals** — Create links that let external collaborators upload files directly to your server
- **Local uploads** — Transfer files from your workstation to the server with optional review copy generation and watermarking
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

Download the latest release from the [Releases page](https://github.com/45Drives/45flow-premium-dev/releases) and install:

| OS | File | Install |
|----|------|---------|
| macOS (Apple Silicon) | `*-mac-arm64.dmg` | Drag to Applications |
| macOS (Intel) | `*-mac-x64.dmg` | Drag to Applications |
| Windows | `*-win-x64.exe` | Run installer |
| Ubuntu/Debian | `*-linux-amd64.deb` | `sudo apt install ./45flow-*.deb` |
| Rocky/RHEL | `*-linux-x86_64.rpm` | `sudo dnf install ./45flow-*.rpm` |

### 2. Connect to Your Server

1. Open 45Flow — your server should appear automatically if `houston-broadcaster` is running.
2. If not, enter the server IP manually.
3. Log in with your server credentials.
4. Activate your license key on first connection (`STUDIO-XXXX-XXXX-XXXX-XXXX`).

### 3. Start Sharing

From the Dashboard, use the three main actions:

| Action | What It Does |
|--------|-------------|
| **New File Share Link** | Select files on the server → configure access → generate a link |
| **Upload Files Locally** | Pick local files → choose destination → upload to server |
| **New Upload Link** | Pick a destination folder → configure access → generate an upload portal link |

For detailed walkthroughs of every feature, see the [Full User Guide](docs/45Flow_User_Guide.md).

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

See [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) for the full build and release process.

---

## License

See [LICENSE](LICENSE).
