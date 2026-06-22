import { app, BrowserWindow, ipcMain } from 'electron'

export function initAutoUpdates(getMainWindow: () => BrowserWindow | null) {
    // Never run auto-update in dev
    if (!app.isPackaged) return

    let autoUpdater: any
    try {
        ;({ autoUpdater } = require('electron-updater'))
    } catch (e) {
        console.warn('[updates] electron-updater is unavailable; auto-update disabled.', e)
        return
    }

    // Don't auto-download — let the user choose when to download
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.fullChangelog = false
    autoUpdater.allowPrerelease = false

    // ── License-gated update eligibility ──
    // Only actively licensed servers get updates.
    // Community (never licensed) and fallback (expired) do NOT.
    let _updateEligible = false

    ipcMain.on('license:update-eligible', (_event, eligible: boolean) => {
        const prev = _updateEligible
        _updateEligible = !!eligible
        console.log(`[updates] update-eligible changed: ${prev} → ${_updateEligible}`)

        // If we just became eligible, do an initial check
        if (!prev && _updateEligible) {
            autoUpdater.checkForUpdates().catch((err: any) => {
                console.warn('[updates] Auto-check after license activation failed:', err?.message || err)
            })
        }
    })

    /**
     * Returns true when the updater error really just means
     * "there is no applicable stable release" — not a real failure.
     */
    function isNoReleaseError(err: any): boolean {
        const raw = String(err?.message || err || '')
        const compact = raw.replace(/\s+/g, ' ').trim()
        // XML/Atom feed → GitHub has no /releases/latest (only prereleases/drafts)
        if (/<(feed|entry|content|title|updated|link)\b/i.test(compact) || /&lt;[a-z!/]/i.test(compact)) return true
        if (/prerelease|pre-release/i.test(compact)) return true
        if (/No published versions on GitHub/i.test(compact)) return true
        if (/Cannot find .*latest\.yml/i.test(compact)) return true
        // 404 from /releases/latest when only prereleases exist
        if (/404/i.test(compact) && !/rate limit|API rate/i.test(compact)) return true
        return false
    }

    function normalizeUpdaterError(err: any): string {
        const raw = String(err?.message || err || 'Unknown updater error')
        const compact = raw.replace(/\s+/g, ' ').trim()

        console.error('[updates] Raw updater error:', raw)
        // GitHub API rate limit (60 req/hr unauthenticated)
        if (/rate limit|API rate|403/i.test(compact)) {
            return 'GitHub API rate limit exceeded. Too many update checks were made from your network. Please wait an hour and try again, or check your network if you are behind a shared IP/VPN.'
        }
        // Network-level failures
        if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|getaddrinfo/i.test(compact)) {
            return 'Could not reach GitHub to check for updates. Please check your internet connection and ensure github.com is not blocked by a firewall or proxy.'
        }
        if (/UNABLE_TO_GET_ISSUER_CERT|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED|SSL|certificate/i.test(compact)) {
            return 'SSL/TLS certificate error while contacting GitHub. This is often caused by a corporate proxy performing TLS inspection. Check your network security settings.'
        }
        // Disk/permission errors during download
        if (/EACCES|EPERM|permission denied/i.test(compact)) {
            return 'Permission denied while downloading or saving the update. Try running the app as an administrator, or check write permissions on your user folder.'
        }
        if (/ENOSPC|no space/i.test(compact)) {
            return 'Not enough disk space to download the update. Free up some space and try again.'
        }
        // Timeout
        if (/timeout|timed?\s*out/i.test(compact)) {
            return 'The update check timed out. Your internet connection may be slow or GitHub may be temporarily unavailable. Please try again.'
        }

        if (/GitHubProvider|getLatestVersion|checkForUpdates|electron-updater|AppUpdater/i.test(compact)) {
            return `Update check failed due to an internal updater error. Details: ${compact.slice(0, 200)}`
        }

        return `Update check failed with an unexpected error. Details: ${compact.slice(0, 200)}`
    }

    autoUpdater.on('checking-for-update', () => {
        getMainWindow()?.webContents.send('update:checking')
    })

    autoUpdater.on('update-available', (info) => {
        getMainWindow()?.webContents.send('update:available', info)
    })

    autoUpdater.on('update-not-available', (info) => {
        getMainWindow()?.webContents.send('update:none', info)
    })

    autoUpdater.on('download-progress', (p) => {
        getMainWindow()?.webContents.send('update:progress', {
            percent: p.percent,
            transferred: p.transferred,
            total: p.total,
            bytesPerSecond: p.bytesPerSecond,
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        getMainWindow()?.webContents.send('update:downloaded', info)
    })

    autoUpdater.on('error', (err) => {
        if (isNoReleaseError(err)) {
            console.log('[updates] No stable release found — treating as up-to-date')
            getMainWindow()?.webContents.send('update:none', {})
        } else {
            getMainWindow()?.webContents.send('update:error', {
                message: normalizeUpdaterError(err),
            })
        }
    })

    ipcMain.handle('update:check', async () => {
        if (!_updateEligible) {
            throw new Error('App updates require an active 45Flow license. Activate or renew your license to receive updates.')
        }
        try {
            return await autoUpdater.checkForUpdates()
        } catch (err) {
            if (isNoReleaseError(err)) {
                console.log('[updates] No stable release found — treating as up-to-date')
                return null
            }
            throw new Error(normalizeUpdaterError(err))
        }
    })

    ipcMain.handle('update:download', async () => {
        if (!_updateEligible) {
            throw new Error('App updates require an active 45Flow license. Activate or renew your license to receive updates.')
        }
        try {
            return await autoUpdater.downloadUpdate()
        } catch (err) {
            throw new Error(normalizeUpdaterError(err))
        }
    })

    ipcMain.handle('update:install', async () => {
        // On Linux with deb/rpm installations (not AppImage), the updater cannot
        // replace system files without sudo. Instead of prompting for elevation,
        // we direct users to manually install the downloaded package.
        if (process.platform === 'linux') {
            // Check if running from AppImage (portable, no sudo needed)
            const isAppImage = !!process.env.APPIMAGE
            
            // Check if the downloaded file is a deb or rpm package
            const downloadPath = autoUpdater.downloadedUpdateHelper?.downloadedFileInfo?.path || ''
            const isDebOrRpm = /\.(deb|rpm)$/i.test(downloadPath)
            
            if (!isAppImage && isDebOrRpm && downloadPath) {
                const fileType = downloadPath.endsWith('.deb') ? 'deb' : 'rpm'
                const installCmd = fileType === 'deb' 
                    ? `sudo apt install "${downloadPath}"`
                    : `sudo dnf install "${downloadPath}"`
                
                return {
                    ok: false,
                    manualInstall: true,
                    downloadPath,
                    error: `On Linux with system-installed packages, automatic installation requires administrator access.\n\n` +
                           `The update has been downloaded to:\n${downloadPath}\n\n` +
                           `To complete the installation:\n\n` +
                           `1. Open a terminal\n` +
                           `2. Run: ${installCmd}\n` +
                           `3. Enter your password when prompted\n\n` +
                           `Your settings and data will be preserved during the upgrade.`
                }
            }
            
            if (!isAppImage && !downloadPath) {
                return {
                    ok: false,
                    error: 'Update downloaded but file path not available. Please download the update manually from the GitHub releases page.'
                }
            }
        }
        
        // AppImage or other platforms: proceed with normal auto-install
        autoUpdater.quitAndInstall(false, true)
        return { ok: true }
    })

    // No automatic check on startup — update checks are triggered by the renderer
    // when it confirms the server has an active license (not community, not fallback).
}
