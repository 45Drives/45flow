// src/renderer/composables/useUploadTranscode.ts
//
// Unified client-side transcode orchestrator.
// Used by: LocalUploadPanel, QuickShareOverlay, CreateLinkView
//
// Flow (each phase is INDEPENDENT — if proxy fails, HLS is already done):
//   1. Get transcode plan from server (output paths + claim jobs)
//   2. Heartbeat keeps claims alive throughout
//   3. Phase A: FFmpeg HLS → upload HLS → transcode-complete HLS
//   4. Phase B: FFmpeg proxy → upload proxy → transcode-complete proxy
//
// Progress is always tracked via polling tasks (startAssetVersionTranscodeTask)
// that read from the server DB. This composable never updates TransferDock tasks
// directly — it only pushes to the server.

import { useClientTranscode } from './useClientTranscode'
import { useTransferProgress, type TransferContext } from './useTransferProgress'
import type { WatermarkSettings } from '../types/watermark'

type ApiFetch = (path: string, init?: any) => Promise<any>

export interface ClientTranscodeOpts {
    assetVersionId: number
    sourceFilePath: string
    filename: string
    proxyQualities: string[]
    generateHls: boolean
    watermarkPath?: string | null
    watermarkSettings?: WatermarkSettings | null
    /** When true, do NOT delete the watermark temp file after transcode (caller handles cleanup) */
    skipWatermarkCleanup?: boolean
    // HTTP upload of transcode outputs to server
    apiBase: string
    apiToken: string
    // Server API
    apiFetch: ApiFetch
    /** Called on each FFmpeg progress tick (unthrottled) so callers can update their own UI */
    onProgress?: (phase: 'hls' | 'proxy_mp4', percent: number, detail?: { speed?: string; eta?: string }) => void
    /** TransferContext for dock tasks — if provided, polling tasks are created internally after transcode-plan */
    context?: TransferContext
}

export interface TranscodePollingOpts {
    assetVersionId: number
    filename: string
    proxyQualities: string[]
    generateHls: boolean
    apiFetch: ApiFetch
    context: TransferContext
}

export interface ClientTranscodeResult {
    ok: boolean
    error?: string
}

/**
 * Refresh client_claimed_at on the server without overwriting progress/speed/eta.
 * Called during phases where no per-kind progress is pushed (probing, between phases).
 */
async function pushHeartbeat(apiFetch: ApiFetch, assetVersionId: number) {
    apiFetch('/api/ingest/transcode-heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetVersionId }),
    }).catch(() => {})
}

export function useUploadTranscode() {
    const { preset: transcodePreset, hwAccel: hwAccelSetting } = useClientTranscode()
    const transfer = useTransferProgress()

    /**
     * Create TransferDock polling tasks (HLS + proxy_mp4) that track
     * transcode progress from the server DB.
     * Call this BEFORE runClientTranscode so the UI shows "Queued" immediately.
     */
    function createTranscodePollingTasks(opts: TranscodePollingOpts): {
        hlsTaskId: string | null
        proxyTaskId: string | null
    } {
        let hlsTaskId: string | null = null
        let proxyTaskId: string | null = null

        if (opts.generateHls) {
            hlsTaskId = transfer.startAssetVersionTranscodeTask({
                apiFetch: opts.apiFetch,
                assetVersionIds: [opts.assetVersionId],
                title: `Transcoding: ${opts.filename}`,
                detail: 'Generating stream…',
                intervalMs: 1500,
                jobKind: 'hls',
                context: { ...opts.context, proxyQualities: opts.proxyQualities.slice() },
            })
        }

        if (opts.proxyQualities.length > 0) {
            proxyTaskId = transfer.startAssetVersionTranscodeTask({
                apiFetch: opts.apiFetch,
                assetVersionIds: [opts.assetVersionId],
                title: `Transcoding: ${opts.filename}`,
                detail: 'Generating review copy…',
                intervalMs: 1500,
                jobKind: 'proxy_mp4',
                context: { ...opts.context, proxyQualities: opts.proxyQualities.slice() },
            })
        }

        return { hlsTaskId, proxyTaskId }
    }

    /**
     * Run the full client-side transcode flow.
     * HLS and proxy are run as SEPARATE FFmpeg calls, each independently
     * uploaded and marked complete. This means:
     *   - If proxy fails, HLS is already done (watermark shows, stream plays)
     *   - Server unblocks proxy pickup as soon as HLS is marked done
     *   - No complex overallPercent math — each phase is 0-100 on its own
     */
    async function runClientTranscode(opts: ClientTranscodeOpts): Promise<ClientTranscodeResult> {
        console.log('[client-transcode] starting:', {
            assetVersionId: opts.assetVersionId,
            filename: opts.filename,
            proxyQualities: opts.proxyQualities,
            generateHls: opts.generateHls,
            hwAccel: hwAccelSetting.value,
            preset: transcodePreset.value,
            watermark: opts.watermarkPath || 'none',
            apiBase: opts.apiBase,
        })

        // Log hardware detection results to renderer console for debugging
        try {
            const caps = await (window as any).electron.getTranscodeCapabilities()
            console.log('[client-transcode] hardware capabilities:', caps)
        } catch (e) {
            console.warn('[client-transcode] could not fetch hardware capabilities:', e)
        }

        // Heartbeat runs throughout ALL phases (probe, gap between phases, etc.)
        let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
            pushHeartbeat(opts.apiFetch, opts.assetVersionId)
        }, 8000)
        const stopHeartbeat = () => {
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
        }

        try {
            // 1. Get transcode plan from server
            const plan = await opts.apiFetch('/api/ingest/transcode-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetVersionId: opts.assetVersionId,
                    proxyQualities: opts.proxyQualities,
                    hls: opts.generateHls,
                    filename: opts.filename,
                }),
            })

            if (!plan?.ok || !plan?.transcodesAbsDir) {
                stopHeartbeat()
                console.error('[client-transcode] transcode-plan failed:', plan)
                return { ok: false, error: 'Transcode plan failed — server will handle' }
            }

            // Create Transfer Dock polling tasks NOW (after transcode-plan created the DB jobs)
            // so they find jobs immediately on first poll.
            let dockHlsTaskId: string | null = null
            let dockProxyTaskId: string | null = null
            if (opts.context) {
                const ids = createTranscodePollingTasks({
                    assetVersionId: opts.assetVersionId,
                    filename: opts.filename,
                    proxyQualities: opts.proxyQualities,
                    generateHls: opts.generateHls,
                    apiFetch: opts.apiFetch,
                    context: opts.context,
                })
                dockHlsTaskId = ids.hlsTaskId
                dockProxyTaskId = ids.proxyTaskId
            }

            // Initial heartbeat to keep claims alive
            await pushHeartbeat(opts.apiFetch, opts.assetVersionId)

            // ── Helper: throttled progress reporter ──────────────────────
            const lastReport: Record<string, number> = {}
            const kindStartTime: Record<string, number> = {}
            const reportProgress = (
                kind: string,
                progress: any,
                kindPercent: number,
                extra?: Record<string, any>
            ) => {
                const now = Date.now()
                // Allow first report per kind and any report ≥ previous to pass immediately;
                // throttle only rapid-fire updates within 2s
                if (lastReport[kind] && now - lastReport[kind] < 2000 && kindPercent > 0) return
                lastReport[kind] = now
                if (!kindStartTime[kind]) kindStartTime[kind] = now
                const speedNum = parseFloat(progress.speed) || null
                let etaNum: number | null = null
                if (kindPercent > 2) {
                    const elapsedSec = (now - kindStartTime[kind]) / 1000
                    const remainSec = Math.round(elapsedSec * ((100 - kindPercent) / kindPercent))
                    if (remainSec > 0) etaNum = remainSec
                }
                opts.apiFetch('/api/ingest/transcode-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        assetVersionId: opts.assetVersionId,
                        kind,
                        progress: Math.round(Math.min(99, kindPercent)),
                        speed: speedNum,
                        etaSeconds: etaNum,
                        encoder: progress.encoder || undefined,
                        ...extra,
                    }),
                }).catch(() => {})
            }

            // ── Helper: upload transcode outputs to server via HTTP ─────
            const uploadOutputs = async (outputDir: string, subDir?: string): Promise<boolean> => {
                const res = await (window as any).electron.uploadTranscodeOutput({
                    outputDir,
                    targetDir: plan.transcodesDir,
                    apiBase: opts.apiBase,
                    apiToken: opts.apiToken,
                    subDir,
                })
                if (!res?.ok) {
                    console.error('[client-transcode] upload outputs failed:', res?.error)
                }
                return !!res?.ok
            }

            // ── Phase 1: HLS ─────────────────────────────────────────────
            let hlsOk = false
            if (opts.generateHls) {
                try {
                    // Report 0% immediately so the UI doesn't flash stale data
                    reportProgress('hls', { speed: '0' }, 0)

                    // console.log('[client-transcode] starting HLS phase…')
                    const { done } = await (window as any).electron.fullTranscodeStart(
                        {
                            inputPath: opts.sourceFilePath,
                            proxyQualities: opts.proxyQualities as ('720p' | '1080p' | 'original')[],
                            generateHls: true,
                            generateProxy: false,
                            watermarkPath: opts.watermarkPath || undefined,
                            watermarkSettings: opts.watermarkSettings || undefined,
                            useHardwareAccel: hwAccelSetting.value,
                            preset: transcodePreset.value,
                        },
                        (progress: any) => {
                            if (progress.phase === 'hls') {
                                // overallPercent is HLS progress directly (only phase running)
                                reportProgress('hls', progress, progress.overallPercent)
                                opts.onProgress?.('hls', progress.overallPercent, {
                                    speed: progress.speed,
                                    eta: progress.eta,
                                })
                            }
                        }
                    )

                    const result = await done
                    if (result?.ok && result?.hlsDir) {
                        // Push HLS to ~100% before upload
                        lastReport['hls'] = 0
                        reportProgress('hls', { speed: '0' }, 99)

                        const uploaded = await uploadOutputs(result.outputDir, 'hls')
                        // Clean up HLS temp dir regardless of upload outcome
                        if (result.outputDir) {
                            (window as any).electron.cleanupTranscodeTemp(result.outputDir).catch(() => {})
                        }
                        if (uploaded) {
                            await opts.apiFetch('/api/ingest/transcode-complete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    assetVersionId: opts.assetVersionId,
                                    kind: 'hls',
                                    outRel: `${plan.transcodesDir}/hls/master.m3u8`,
                                    outJson: null,
                                }),
                            }).catch((e: any) => console.error('[client-transcode] HLS complete failed:', e))
                            hlsOk = true
                            opts.onProgress?.('hls', 100)
                            if (dockHlsTaskId) transfer.completeTranscodeTask(dockHlsTaskId)
                        } else {
                            console.error('[client-transcode] HLS upload failed')
                        }
                    } else {
                        console.error('[client-transcode] HLS FFmpeg failed:', result?.error)
                    }
                } catch (err: any) {
                    console.error('[client-transcode] HLS phase error:', err?.message || err)
                }
            }

            // ── Phase 2: Proxy MP4 ───────────────────────────────────────
            let proxyOk = false
            if (opts.proxyQualities.length > 0) {
                try {
                    // Report 0% immediately so the UI doesn't flash stale data
                    reportProgress('proxy_mp4', { speed: '0' }, 0)

                    // console.log('[client-transcode] starting proxy phase…')
                    const { done } = await (window as any).electron.fullTranscodeStart(
                        {
                            inputPath: opts.sourceFilePath,
                            proxyQualities: opts.proxyQualities as ('720p' | '1080p' | 'original')[],
                            generateHls: false,
                            watermarkPath: opts.watermarkPath || undefined,
                            watermarkSettings: opts.watermarkSettings || undefined,
                            useHardwareAccel: hwAccelSetting.value,
                            preset: transcodePreset.value,
                        },
                        (progress: any) => {
                            if (progress.phase === 'proxy') {
                                const vals = Object.values(progress.perQualityProgress || {}) as number[]
                                const avg = vals.length > 0
                                    ? vals.reduce((a, b) => a + b, 0) / vals.length
                                    : 0
                                reportProgress('proxy_mp4', progress, avg, {
                                    activeQuality: progress.activeQuality || null,
                                    perQualityProgress: progress.perQualityProgress || null,
                                    qualityOrder: opts.proxyQualities,
                                })
                                opts.onProgress?.('proxy_mp4', avg, {
                                    speed: progress.speed,
                                    eta: progress.eta,
                                })
                            }
                        }
                    )

                    const result = await done
                    if (result?.ok && result?.proxyFiles && Object.keys(result.proxyFiles).length > 0) {
                        const uploaded = await uploadOutputs(result.outputDir)
                        // Clean up proxy temp dir regardless of upload outcome
                        if (result.outputDir) {
                            (window as any).electron.cleanupTranscodeTemp(result.outputDir).catch(() => {})
                        }
                        if (uploaded) {
                            await opts.apiFetch('/api/ingest/transcode-complete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    assetVersionId: opts.assetVersionId,
                                    kind: 'proxy_mp4',
                                    outRel: plan.transcodesDir,
                                    outJson: JSON.stringify({ qualities: Object.keys(result.proxyFiles) }),
                                }),
                            }).catch((e: any) => console.error('[client-transcode] proxy complete failed:', e))
                            proxyOk = true
                            opts.onProgress?.('proxy_mp4', 100)
                            if (dockProxyTaskId) transfer.completeTranscodeTask(dockProxyTaskId)
                        } else {
                            console.error('[client-transcode] proxy upload failed')
                        }
                    } else {
                        console.error('[client-transcode] proxy FFmpeg failed:', result?.error)
                    }
                } catch (err: any) {
                    console.error('[client-transcode] proxy phase error:', err?.message || err)
                }
            }

            stopHeartbeat()

            // Clean up watermark temp file if one was downloaded (skip if caller manages cleanup)
            if (opts.watermarkPath && !opts.skipWatermarkCleanup) {
                (window as any).electron.cleanupWatermarkTemp(opts.watermarkPath).catch(() => {})
            }

            const allOk = (opts.generateHls ? hlsOk : true)
                && (opts.proxyQualities.length > 0 ? proxyOk : true)
            const parts = [
                ...(hlsOk ? ['hls'] : []),
                ...(proxyOk ? ['proxy_mp4'] : []),
            ]
            if (parts.length > 0) {
                // console.log(`[client-transcode] ✓ ${opts.filename} — ${parts.join(', ')}`)
            }
            return {
                ok: allOk,
                error: allOk ? undefined : 'One or more transcode phases failed',
            }
        } catch (err: any) {
            stopHeartbeat()
            console.error('[client-transcode] fatal error:', err?.message || err)
            return { ok: false, error: err?.message || String(err) }
        }
    }

    return {
        createTranscodePollingTasks,
        runClientTranscode,
    }
}
