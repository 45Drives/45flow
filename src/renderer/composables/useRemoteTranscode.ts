// src/renderer/composables/useRemoteTranscode.ts
//
// Orchestrates client-side transcoding of files already on the server.
// Flow:
//   1. Get a scoped streaming token from the server
//   2. Construct the streaming URL (FFmpeg reads this as HTTP input)
//   3. Delegate to runClientTranscode with isRemoteSource=true
//   4. FFmpeg streams chunks on demand → transcodes locally → uploads outputs back
//
// The source file is never fully stored on the client disk. FFmpeg's HTTP
// input protocol uses Range requests to read chunks as needed and discards
// them after encoding.

import { ref } from 'vue'
import { useUploadTranscode, type ClientTranscodeOpts, type ClientTranscodeResult } from './useUploadTranscode'
import { useTransferProgress, type TransferContext } from './useTransferProgress'
import type { TextWatermarkLayer, WatermarkSettings } from '../types/watermark'

type ApiFetch = (path: string, init?: any) => Promise<any>

export interface RemoteTranscodeOpts {
    assetVersionId: number
    filename: string
    proxyQualities: string[]
    generateHls: boolean
    watermarkPath?: string | null
    watermarkSettings?: WatermarkSettings | null
    watermarkText?: TextWatermarkLayer | null
    watermarkLinkTitle?: string
    skipWatermarkCleanup?: boolean
    apiBase: string
    apiToken: string
    apiFetch: ApiFetch
    onProgress?: (phase: 'hls' | 'proxy_mp4', percent: number, detail?: { speed?: string; eta?: string }) => void
    context?: TransferContext
}

const activeRemoteTranscodes = ref<Set<number>>(new Set())

export function useRemoteTranscode() {
    const { runClientTranscode } = useUploadTranscode()

    function isRemoteTranscoding(assetVersionId: number): boolean {
        return activeRemoteTranscodes.value.has(assetVersionId)
    }

    async function runRemoteTranscode(opts: RemoteTranscodeOpts): Promise<ClientTranscodeResult> {
        if (activeRemoteTranscodes.value.has(opts.assetVersionId)) {
            return { ok: false, error: 'Remote transcode already in progress for this file' }
        }

        activeRemoteTranscodes.value.add(opts.assetVersionId)
        try {
            // 1. Get a scoped streaming token (24h TTL, locked to this assetVersionId)
            const tokenRes = await opts.apiFetch('/api/ingest/source-stream-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetVersionId: opts.assetVersionId }),
            })

            if (!tokenRes?.ok || !tokenRes?.streamToken) {
                console.error('[remote-transcode] failed to get stream token:', tokenRes)
                return { ok: false, error: 'Failed to get source stream token from server' }
            }

            // 2. Construct the streaming URL that FFmpeg will use as -i input
            const streamUrl = `${opts.apiBase}/api/ingest/source-stream/${opts.assetVersionId}?token=${encodeURIComponent(tokenRes.streamToken)}`

            console.log('[remote-transcode] starting remote client transcode:', {
                assetVersionId: opts.assetVersionId,
                filename: opts.filename,
                streamUrl: streamUrl.replace(/token=[^&]+/, 'token=<redacted>'),
            })

            // 3. Delegate to the standard client transcode flow with the streaming URL
            const result = await runClientTranscode({
                assetVersionId: opts.assetVersionId,
                sourceFilePath: streamUrl,
                filename: opts.filename,
                proxyQualities: opts.proxyQualities,
                generateHls: opts.generateHls,
                watermarkPath: opts.watermarkPath,
                watermarkSettings: opts.watermarkSettings,
                watermarkText: opts.watermarkText,
                watermarkLinkTitle: opts.watermarkLinkTitle,
                skipWatermarkCleanup: opts.skipWatermarkCleanup,
                isRemoteSource: true,
                apiBase: opts.apiBase,
                apiToken: opts.apiToken,
                apiFetch: opts.apiFetch,
                onProgress: opts.onProgress,
                context: opts.context,
            })

            return result
        } catch (err: any) {
            console.error('[remote-transcode] fatal error:', err?.message || err)
            return { ok: false, error: err?.message || String(err) }
        } finally {
            activeRemoteTranscodes.value.delete(opts.assetVersionId)
        }
    }

    return {
        runRemoteTranscode,
        isRemoteTranscoding,
        activeRemoteTranscodes,
    }
}
