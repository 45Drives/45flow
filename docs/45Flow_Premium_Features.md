# 45Flow Premium Features Guide

**45Flow Premium Edition** — Exclusive features available only with a licensed Pro server

---

## Overview

45Flow Premium Edition includes all the features of the Community Edition, plus powerful professional tools designed for studios, production companies, and creative teams who need advanced collaboration, branding, and workflow capabilities.

This guide details the **exclusive features** available only in 45Flow Premium Edition.

---

## Table of Contents

1. [Custom Watermark Customization](#1-custom-watermark-customization)
2. [Custom Branding (White Label)](#2-custom-branding-white-label)
3. [Premium Comments System](#3-premium-comments-system)
4. [Comment Export](#4-comment-export)
5. [Annotations & Drawing Tools](#5-annotations--drawing-tools)
6. [Automatic Updates](#6-automatic-updates)
7. [Multi-Server Management](#7-multi-server-management)
8. [Cross-Subnet Server Discovery](#8-cross-subnet-server-discovery)
9. [Priority Support](#9-priority-support)

---

## 1. Custom Watermark Customization

**Premium Feature** — Requires licensed server

While the Community Edition supports basic watermarking with a fixed logo position, Premium Edition provides complete control over watermark appearance and positioning.

### Watermark Customization Controls

When creating share links or upload links with watermark enabled, Premium users have access to advanced customization:

**Position Controls:**
- **Predefined positions** — Top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right
- **Custom positioning** — Fine-tune exact X/Y coordinates with pixel-level precision
- **Margin control** — Adjust spacing from edges

**Visual Adjustments:**
- **Scale** — Resize watermark from 10% to 200% of original size
- **Opacity** — Control transparency from fully transparent (0%) to fully opaque (100%)
- **Rotation** — Rotate watermark from -180° to +180°

**Watermark Presets:**
- Save frequently-used watermark configurations as named presets
- Quickly apply saved presets when creating new links
- Manage, edit, and delete presets from the Watermarks settings panel

**Default Watermark Library:**
- Access built-in 45Drives watermark graphics
- Use professionally-designed watermarks without uploading custom images

### Use Cases

- **Production workflows** — Apply subtle corner watermarks for internal review copies
- **Client presentations** — Use large centered watermarks for preliminary review
- **Brand protection** — Add rotated diagonal watermarks across the frame
- **Multi-client studios** — Save presets for each client's branding requirements

### How It Works

Premium watermark settings are processed server-side during transcoding. The watermark is permanently embedded in generated review copies and cannot be removed by recipients.

> **Note:** Community Edition supports watermarking with a fixed bottom-right position only. Customization requires Premium.

---

## 2. Custom Branding (White Label)

**Premium Feature** — Requires licensed server

Transform 45Flow into your own branded platform with complete white-label customization. Perfect for studios, agencies, and production houses who want client-facing share links to match their brand identity.

### Company Identity

- **Company name** — Displayed on all share pages below your logo (max 200 characters)
- **Support email** — Clickable mailto link on share pages for recipient support
- **Support URL** — Link to your help desk, FAQ, or support portal

### Theme & Colors

Choose from **22+ built-in themes** or create your own custom brand palette:

**Built-in Themes:**
- Dark themes (Studio Slate, Blue Steel, Ocean)
- Light themes (Chrome, Enterprise)
- Gradient themes (Aurora, Electric Violet, Neon Studio, Sunset Laser, Moon Mist, and more)
- Specialty themes (HomeLab, Professional)

**Custom Theme:**
- Define **primary color** for buttons, links, and accents
- Define **secondary color** for gradients, hover states, and supporting elements
- Live gradient preview shows how colors render together
- WCAG contrast warnings help ensure accessibility

### Company Logo

Upload custom logos to replace the 45Flow logo on all share and upload pages:

- **Single logo** — One logo for all backgrounds
- **Split logos** — Separate logos optimized for light and dark themes
- Supported formats: PNG, JPEG, SVG, WebP (max 2 MB)
- Live preview shows logo dimensions and appearance

### Link Preview Metadata (Open Graph)

Customize how your share links appear in social media, Slack, Teams, and email:

- **Link preview title** — The title shown in social cards and link unfurls (max 200 characters)
- **Link preview description** — Description text below the title (max 500 characters)

**Example:**  
Instead of "45Flow — Secure file sharing", links could show:  
**"Acme Studios — Review your project files securely"**

### Live Preview

The branding panel includes real-time visual previews:
- Password-protected link page
- Video review player page
- Upload link page

All previews update instantly as you modify settings.

### Theme Enforcement

When an enforced theme is set, recipients **cannot change** the theme on share pages — the theme picker is hidden. This ensures consistent brand presentation across all shared content.

### How Branding Appears to Recipients

When custom branding is active, recipients viewing your share links see:
- Your logo (not the 45Flow logo)
- Your company name
- Your brand colors applied to buttons, links, gradients, backgrounds
- Your support contact information
- "Powered by 45Flow" attribution footer (required)

> **Important:** Branding is tied to your server's license. If the license expires or is revoked, share pages revert to default 45Flow branding.

---

## 3. Premium Comments System

**Premium Feature** — Requires licensed server

Enhanced commenting with status tracking, tagging, and bulk management capabilities.

### Resolved/Unresolved Status

Track the lifecycle of review feedback:

- **Mark comments as resolved** — Indicate when feedback has been addressed
- **Timestamp tracking** — Records who resolved the comment and when
- **Filter by status** — View only unresolved comments to focus on remaining work
- **Visual indicators** — Resolved comments are clearly marked with checkmarks

### Comment Tags

Organize and categorize comments for easier workflow management:

- **Add tags** to comments (e.g., "audio", "color correction", "urgent", "fixed")
- **Multiple tags per comment** — Tag comments with as many categories as needed
- **Filter by tag** — Quickly find all comments with a specific tag
- **Tag-based exports** — Export comments filtered by tag

### Bulk Comment Retrieval

Access all comments across all files in a link:

- **GET /api/links/:linkId/comments** — Retrieve every comment in a link with a single API call
- **Comment statistics** — Total, resolved, unresolved, and annotated counts
- **File-grouped display** — Comments organized by file for easy navigation
- **Full metadata** — Includes author, timecode, frame number, SMPTE timecode, creation date, replies, annotations

### Comment Management Dashboard

View and manage all comments from the Link Details screen:

- **Comments Review Panel** — See all comments across all files in the link
- **Resolve/unresolve** — Update comment status with one click
- **Edit tags** — Add, remove, or modify tags inline
- **Jump to timecode** — Click any comment to load the video at that exact frame
- **View annotations** — Preview drawing annotations without opening the video player

---

## 4. Comment Export

**Premium Feature** — Requires licensed server

Export comments in multiple professional formats for integration with post-production workflows, project documentation, and archival.

### Supported Formats

#### JSON Export
Full-fidelity structured data export:
```json
{
  "exportMeta": {
    "linkId": 123,
    "linkTitle": "Project XYZ Review",
    "exportedAt": "2026-05-21T14:30:00Z",
    "totalComments": 42,
    "resolvedCount": 38
  },
  "files": [...]
}
```

**Use case:** API integration, automated workflows, data archival

#### CSV Export
Spreadsheet-compatible format for analysis and reporting:
```csv
File,Timecode,Seconds,Frame,Author,Comment,Status,Created,Resolved Date,Replies,Has Annotation,Tags
scene_01.mp4,00:00:15:17,15.68,377,Jordan,"Fix audio sync",Unresolved,2026-05-20,,,0,No,"audio, urgent"
```

**Use case:** Excel/Google Sheets analysis, project management tools, client reporting

#### Markdown Export
Human-readable documentation format:
```markdown
# Comments: Project XYZ Review
**Total Comments:** 42 | **Resolved:** 38 | **Unresolved:** 4

## File: scene_01.mp4

### 00:00:15:17 - Jordan
> Fix audio sync issue

**Status:** ⚠️ **UNRESOLVED**
**Created:** 2026-05-20 14:30:00
**Tags:** audio, urgent
```

**Use case:** Project documentation, README files, GitHub/GitLab issues, client deliverables

#### WebVTT Export
Video editor marker format compatible with:
- **Adobe Premiere Pro** (import as markers)
- **DaVinci Resolve** (import as markers)
- **Final Cut Pro X** (import as markers)

```vtt
WEBVTT

NOTE Created by 45Flow Premium
NOTE Link: Project XYZ Review

00:00:15.680 --> 00:00:15.680
[Jordan] ⚠️ Fix audio sync issue
NOTE: UNRESOLVED
NOTE: Tags: audio, urgent
```

**Use case:** Import feedback directly into your editing timeline as markers

### Export Options

- **Export all comments** — Download every comment from the link
- **Export unresolved only** — Focus on outstanding feedback
- **Choose format at download time** — Select format when exporting
- **Automatic filename** — Files named with link title and export date

### How to Export Comments

1. Navigate to **Link Details** for any share link
2. Click **"Export Comments"** in the Comments section
3. Choose your desired format (JSON, CSV, Markdown, WebVTT)
4. File downloads immediately

---

## 5. Annotations & Drawing Tools

**Premium Feature** — Requires licensed server

Draw directly on video frames to provide precise visual feedback. Annotations are saved alongside timecoded comments and can be viewed by anyone accessing the link.

### Drawing Tools

**Freehand Drawing:**
- Draw free-form paths and circles to highlight specific areas
- Variable line thickness
- Smooth anti-aliased rendering

**Shapes:**
- **Rectangle** — Draw rectangular highlights and boxes
- **Circle/Ellipse** — Draw circular or elliptical highlights
- **Arrow/Line** — Draw directional arrows or straight lines for pointing to specific elements

**Color Selection:**
- Choose from a palette of annotation colors
- Each user has a default color, but can override per-annotation
- High-contrast colors ensure visibility on all video content

### Creating Annotations

1. Open a share link with video content
2. Pause the video at the frame you want to annotate
3. Click the **annotation/draw tool** button in the comment area
4. Select a drawing tool (freehand, rectangle, circle, arrow)
5. Draw on the video frame
6. Type your comment text
7. Submit — the annotation is saved at the exact timecode

### Viewing Annotations

**In the Video Player:**
- Navigate to any comment with an annotation
- The drawing renders on top of the video at the correct timecode
- Playback resumes with annotation overlay visible

**In Link Details:**
- Comments with annotations show an **"View Annotation"** button
- Click to open the **Annotation Viewer** modal
- View full-size annotated frame with all drawing data rendered
- See complete comment thread and metadata

**In Comment Exports:**
- Annotation presence is indicated in CSV and JSON exports
- Frame extraction available via API for custom workflows

### Annotation Data

All annotation data is stored server-side and tied to the comment:
- **Drawing coordinates** — Precise vector paths for each tool
- **Colors** — User-selected annotation colors
- **Frame metadata** — Exact frame number, timecode, and file reference
- **Author** — Who created the annotation
- **Timestamp** — When it was created

### Use Cases

- **VFX review** — Circle problem areas in composites
- **Color grading feedback** — Arrow to specific color issues
- **Editorial notes** — Highlight timing problems with freehand marks
- **Client approvals** — Draw boxes around approved sections

---

## 6. Automatic Updates

**Premium Feature** — Premium Edition clients only

Stay current with the latest features and security improvements with built-in automatic update detection and installation.

### Update Detection

45Flow Premium checks for updates:
- **On application launch**
- **Periodically while running** (every few hours)

When a new version is available, an **update banner** appears at the top of the application window showing:
- New version number
- "Download" button to begin update download
- Ability to dismiss and update later

### Update Process

**macOS:**
1. Click **"Download"** — Update downloads in the background
2. Progress indicator shows download status
3. When complete, click **"Install & Restart"**
4. App quits, applies update, and relaunches automatically
5. All settings and server connections are preserved

**Windows:**
1. Click **"Download"** — Update downloads in the background
2. Progress indicator shows download status
3. When complete, click **"Install & Restart"**
4. App quits, applies update, and relaunches automatically
5. All settings and server connections are preserved

**Linux AppImage:**
1. Click **"Download"** — New AppImage downloads
2. When complete, click **"Install & Restart"**
3. AppImage self-updates in place and relaunches
4. No root privileges required

**Linux Package (.deb / .rpm):**
1. Click **"Download"** — Package downloads to ~/Downloads
2. Yellow instruction box shows the installation command:
   - **Debian/Ubuntu:** `sudo apt install /path/to/45Flow-Pro-Edition-x.x.x-linux-amd64.deb`
   - **RHEL/Rocky/Fedora:** `sudo dnf install /path/to/45Flow-Pro-Edition-x.x.x-linux-x86_64.rpm`
3. Open terminal, run the command, enter password
4. Relaunch 45Flow manually

### Benefits

- **Security patches** — Receive critical security updates immediately
- **New features** — Access new capabilities as they're released
- **Bug fixes** — Automatic resolution of known issues
- **No manual checking** — Updates are detected automatically
- **Minimal downtime** — Update and restart takes seconds

> **Community Edition:** Users must manually download new versions from the website and reinstall. No automatic update detection.

---

## 7. Multi-Server Management

**Premium Feature** — Premium Edition clients only

Connect to and manage **multiple 45Flow servers** simultaneously from a single application instance.

### Adding Servers

1. Connect to your first server using auto-discovery or manual IP
2. Use the **Connection Manager** (accessible from the server switcher dropdown in the header) to add additional servers
3. Each server maintains its own:
   - JWT authentication token
   - SSH credentials and connection settings
   - License status
   - User account information

### Switching Between Servers

The **active server** is displayed in the application header bar. Click the server name dropdown to:
- View all connected servers
- Switch to a different server
- Open the Connection Manager to add/remove servers
- See license status for each server

**Active server behavior:**
- All actions (creating links, uploading files, managing users) apply to the active server
- Dashboard shows links from the active server by default

### All Servers View

When multiple servers are connected, a **"Show links from"** filter appears on the Dashboard:

- **All Servers** — Aggregates links from **every** connected server
  - Each table row shows which server the link belongs to
  - Click any link to switch to that server and view details
- **Specific server** — Shows links only from the selected server

### Use Cases

- **Multi-site studios** — Manage servers at different physical locations
- **Client/project isolation** — Separate servers for different clients
- **Production/test environments** — Switch between production and staging servers
- **Agency workflows** — Manage multiple client servers from one app
- **Geo-distributed teams** — Connect to servers in different regions

> **Community Edition:** Single server only. Must disconnect from one server to connect to another.

---

## 8. Cross-Subnet Server Discovery

**Premium Feature** — Premium Edition clients only

Automatically discover 45Flow servers across subnets and remote networks via the **45Drives registry**.

### How It Works

**Community Edition:**
- Uses **mDNS/Bonjour** for auto-discovery
- Only discovers servers on the **same subnet** (local network segment)
- Cannot discover servers across VLANs, VPNs, or remote locations

**Premium Edition:**
- Uses **mDNS/Bonjour** for local subnet discovery (same as Community)
- **Plus:** Queries the **45Drives registry** for licensed servers
- Discovers servers across:
  - Different subnets
  - VLANs
  - VPN connections
  - Remote office locations
  - Cloud-hosted servers

### 45Drives Registry

Licensed 45Flow servers automatically register with the 45Drives registry service when:
- Server has an active Premium license
- Server has internet connectivity
- Registration is enabled in server configuration

The registry maintains:
- Server hostname/IP address
- Last-seen timestamp
- License status
- Server fingerprint (for security)

### Benefits

- **Zero-configuration discovery** — No need to remember IP addresses
- **Multi-location workflows** — Find servers at remote offices automatically
- **VPN-friendly** — Discover servers across VPN tunnels
- **Dynamic IP support** — Find servers even when IP addresses change
- **Centralized visibility** — See all your organization's licensed servers

### Security

- Registry queries require authenticated requests
- Only servers you've previously connected to appear in discovery
- Server fingerprints prevent spoofing
- No sensitive data transmitted to registry
- Registry can be disabled via server configuration

> **Community Edition:** Local subnet (mDNS) discovery only. Cannot discover servers across subnets.

---

## 9. Priority Support

**Premium Feature** — Included with all Premium licenses

Get expedited support from the 45Drives team.

### What's Included

- **Priority ticket routing** — Your support requests are escalated automatically
- **Faster response times** — Dedicated support staff for Premium customers
- **Direct access to engineering** — Complex issues escalated to development team
- **License and activation support** — Assistance with licensing, activation, and renewal
- **Server deployment guidance** — Help with server setup and configuration

### How to Get Support

**Option 1: Email Support**
- Email: support@45drives.com
- Include your license key or server fingerprint in the request
- Premium tickets are automatically prioritized

**Option 2: Phone Support**
- Call: +1 (902) 483-0222
- Mention you're a Premium customer for priority routing

**Option 3: In-App Support**
- Click the **Help** menu in 45Flow
- Select **"Contact Support"**
- Support form auto-includes your license status

### Support Availability

- **Business hours:** 9 AM – 5 PM Atlantic Time (Monday–Friday)
- **Emergency support:** Available for critical production issues (contact via phone)
- **Community forum:** Access to the 45Drives community forum with staff participation

> **Community Edition:** Standard community support via email and public forums. No priority routing or direct engineering access.

---

## Feature Comparison Summary

| Feature | Community Edition | Premium Edition |
|---------|-------------------|-----------------|
| **File sharing & links** | ✅ Full | ✅ Full |
| **Video player** | ✅ Full | ✅ Full |
| **Comments (basic)** | ✅ Yes | ✅ Yes |
| **Comments (resolved status, tags)** | ❌ No | ✅ Yes |
| **Comment export** | ❌ No | ✅ Yes (JSON/CSV/MD/VTT) |
| **Annotations & drawing** | ❌ No | ✅ Yes |
| **Watermark (fixed position)** | ✅ Yes | ✅ Yes |
| **Watermark (custom position/scale/opacity)** | ❌ No | ✅ Yes |
| **Watermark presets** | ❌ No | ✅ Yes |
| **Custom branding/white label** | ❌ No | ✅ Yes |
| **Automatic updates** | ❌ No | ✅ Yes |
| **Multi-server management** | ❌ No | ✅ Yes |
| **Cross-subnet server discovery** | ❌ No | ✅ Yes |
| **Priority support** | ❌ No | ✅ Yes |

---

## Getting Started with Premium

### Purchasing a License

Visit [45Drives.com](https://www.45drives.com) to purchase a 45Flow Premium license. You'll receive:
- A unique license key
- Activation instructions
- Download link for 45Flow Premium Edition

### Activating Your License

1. Download and install **45Flow Premium Edition**
2. Connect to your server
3. When prompted, enter your license key
4. Click **"Activate License"** to validate and activate

The license is tied to your server, not individual client installations. Once activated, all users connecting to the licensed server gain access to Premium features.

### License Types

- **Annual license** — 12-month term with renewal option
- **Perpetual license** — One-time purchase with ongoing update access
- **Multi-server licenses** — Volume licensing available for organizations

### Support & Renewal

- Licenses include 12 months of updates and support
- Renewal notifications appear 30 days before expiration
- Expired licenses revert features to Community Edition level
- Contact sales@45drives.com for enterprise licensing

---

## Questions?

For more information about 45Flow Premium Edition:

- **Sales:** sales@45drives.com
- **Support:** support@45drives.com
- **Phone:** +1 (902) 483-0222
- **Website:** https://www.45drives.com

---

**Document Version:** 1.0  
**Last Updated:** 2026-06-09  
**Applies to:** 45Flow Premium Edition 2.x
