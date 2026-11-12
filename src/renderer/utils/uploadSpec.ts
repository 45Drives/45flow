// Upload-link file requirements (Pro). Mirrors houston-broadcaster
// server/utils/uploadSpecRules.js; the server validates and has the final say.

export type UploadSpecAction = 'reject' | 'flag'

export type UploadSpecRules = {
    action: UploadSpecAction
    allowOtherFiles: boolean
    containers: string[]
    videoCodecs: string[]
    resolutions: string[]
    frameRates: number[]
    aspectRatios: string[]
    minDurationSec: number | null
    maxDurationSec: number | null
    audioChannels: number[]
}

export const SPEC_CONTAINERS = [
    { id: 'mov', label: 'QuickTime (.mov)' },
    { id: 'mp4', label: 'MPEG-4 (.mp4)' },
    { id: 'mxf', label: 'MXF (.mxf)' },
    { id: 'mkv', label: 'Matroska (.mkv)' },
    { id: 'webm', label: 'WebM (.webm)' },
    { id: 'avi', label: 'AVI (.avi)' },
    { id: 'mpegts', label: 'MPEG-TS (.ts, .m2ts)' },
    { id: 'wav', label: 'WAV (.wav)' },
    { id: 'aiff', label: 'AIFF (.aif)' },
    { id: 'mp3', label: 'MP3 (.mp3)' },
]

export const SPEC_VIDEO_CODECS = [
    { id: 'prores', label: 'Apple ProRes' },
    { id: 'dnxhd', label: 'Avid DNxHD / DNxHR' },
    { id: 'h264', label: 'H.264' },
    { id: 'hevc', label: 'H.265 (HEVC)' },
    { id: 'av1', label: 'AV1' },
    { id: 'vp9', label: 'VP9' },
    { id: 'mpeg2video', label: 'MPEG-2' },
    { id: 'jpeg2000', label: 'JPEG 2000' },
    { id: 'cfhd', label: 'GoPro CineForm' },
    { id: 'ffv1', label: 'FFV1' },
    { id: 'v210', label: 'Uncompressed 10-bit (v210)' },
]

export const SPEC_RESOLUTIONS = ['1280x720', '1920x1080', '2048x1080', '3840x2160', '4096x2160']
export const SPEC_FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]
export const SPEC_ASPECT_RATIOS = ['16:9', '1.85:1', '2.39:1', '4:3', '1:1', '9:16']
export const SPEC_AUDIO_CHANNELS = [
    { value: 0, label: 'No audio' },
    { value: 1, label: 'Mono (1)' },
    { value: 2, label: 'Stereo (2)' },
    { value: 6, label: '5.1 (6)' },
    { value: 8, label: '8 channels' },
    { value: 16, label: '16 channels' },
]

export function emptySpecRules(): UploadSpecRules {
    return {
        action: 'reject', allowOtherFiles: false, containers: [], videoCodecs: [], resolutions: [],
        frameRates: [], aspectRatios: [], minDurationSec: null, maxDurationSec: null, audioChannels: [],
    }
}

export function hasAnySpecRule(r: UploadSpecRules | null | undefined): boolean {
    return !!r && (
        r.containers.length > 0 || r.videoCodecs.length > 0 || r.resolutions.length > 0 || r.frameRates.length > 0
        || r.aspectRatios.length > 0 || r.audioChannels.length > 0 || r.minDurationSec != null || r.maxDurationSec != null
    )
}

/** "90", "1:30" or "1:02:03" to seconds; '' to null; anything else to NaN. */
export function parseDuration(text: string): number | null {
    const t = text.trim()
    if (!t) return null
    if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return NaN
    return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0)
}

export function formatDuration(sec: number | null): string {
    if (sec == null) return ''
    const s = Math.round(sec)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = String(s % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export type SpecSummaryPart = { label: string; value: string }

function orList(items: string[]): string {
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}` : items[0] || ''
}

/** One short line per requirement that is set, for summaries next to the editor and in link details. */
export function describeSpecRules(r: UploadSpecRules | null | undefined): SpecSummaryPart[] {
    if (!r) return []
    const parts: SpecSummaryPart[] = []
    const pick = <T extends { label: string }>(list: T[], match: (o: T) => boolean) => list.filter(match).map((o) => o.label)
    if (r.containers.length) {
        const exts = pick(SPEC_CONTAINERS, (c) => r.containers.includes(c.id)).map((l) => l.match(/\(([^)]+)\)/)?.[1] || l)
        parts.push({ label: 'File type', value: orList(exts) })
    }
    if (r.videoCodecs.length) parts.push({ label: 'Codec', value: orList(pick(SPEC_VIDEO_CODECS, (c) => r.videoCodecs.includes(c.id))) })
    if (r.resolutions.length) parts.push({ label: 'Resolution', value: orList(r.resolutions.map((x) => x.replace('x', '×'))) })
    if (r.frameRates.length) parts.push({ label: 'Frame rate', value: `${orList(r.frameRates.map(String))} fps` })
    if (r.aspectRatios.length) parts.push({ label: 'Aspect ratio', value: orList(r.aspectRatios) })
    if (r.minDurationSec != null || r.maxDurationSec != null) {
        const min = formatDuration(r.minDurationSec)
        const max = formatDuration(r.maxDurationSec)
        parts.push({ label: 'Length', value: min && max ? `${min} to ${max}` : min ? `at least ${min}` : `up to ${max}` })
    }
    if (r.audioChannels.length) parts.push({ label: 'Audio', value: orList(pick(SPEC_AUDIO_CHANNELS, (a) => r.audioChannels.includes(a.value))) })
    return parts
}

export function withSpecDefaults(r: Partial<UploadSpecRules> | null | undefined): UploadSpecRules | null {
    return r ? { ...emptySpecRules(), ...r } : null
}
