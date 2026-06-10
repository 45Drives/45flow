// src/types/electron.d.ts

import type { IpcRendererEvent } from 'electron'

export type UploadResult = { ok?: boolean; path?: string; error?: string }
export type ProgressPayload = { percent: number; speed?: string; eta?: string }

export type RsyncProgress = {
  percent?: number
  rate?: string
  eta?: string
  bytesTransferred?: number
  raw?: string
}
export type RsyncOpts = {
  /** local source path (file or directory) */
  src: string
  host: string
  user: string
  destDir: string
  port?: number
  /** path to private key (optional if using ssh-agent) */
  keyPath?: string
  /** limit bandwidth in KB/s */
  bwlimitKb?: number
  /** extra rsync flags */
  extraArgs?: string[]
  /** request proxy transcode after ingest */
  transcodeProxy?: boolean
  /** requested proxy qualities (e.g. ['720p','1080p','original']) */
  proxyQualities?: string[]
  /** request watermark for video files */
  watermark?: boolean
  /** watermark image filename already present in destDir */
  watermarkFileName?: string
  /** qualities that should receive watermark (defaults to proxyQualities) */
  watermarkProxyQualities?: string[]
  /** skip ingest/register after transfer */
  noIngest?: boolean
  /** JWT token for authenticated ingest/register calls */
  apiToken?: string
}
export type LinkType = 'upload' | 'download' | 'collection'
export type Status = 'active' | 'expired' | 'disabled'

export type LinkItem = {
  id: number | string
  type: LinkType
  title?: string | null
  notes?: string | null
  token?: string | null
  url: string
  downloadUrl?: string | null
  createdAt: number
  expiresAt: number | null
  isDisabled: boolean
  passwordRequired?: boolean
  access_mode?: 'open' | 'restricted'
  auth_mode?: 'none' | 'password'
  allow_comments?: boolean
  generateReviewProxy?: boolean
  adaptiveHls?: boolean
  proxyQualities?: string[]
  watermark?: boolean
  watermarkFile?: string | null
  watermarkProxyQualities?: string[]
  createdIp?: string | null
  createdUa?: string | null
  owner?: { id?: number|string|null, username?: string|null, display_name?: string|null }
  target?: { dirRel?: string; allowUpload?: boolean; files?: Array<{ id?: string; name?: string; size?: number; mime?: string }> }
  shareMode?: string | null
  thumbnailUrl?: string | null
}
export type Role = {
  id: number
  name: string
  can_view: boolean
  can_comment: boolean
  can_download: boolean
  can_upload: boolean
  is_system?: boolean
}
export type AccessRow = {
  user_id: number
  user_name?: string
  name?: string
  user_email?: string
  display_color?: string | null
  company?: string | null
  tags?: string[]
  role_id?: number | null
  role_name?: string | null
  role?: {
    id: number
    name: string
    permissions: {
      view: boolean
      comment: boolean
      download: boolean
      upload: boolean
    }
  } | null
  granted_at?: string | null
  is_deleted?: boolean
  is_disabled?: boolean
}
export type Commenter = {
  key: string
  id?: number
  username?: string
  name?: string
  user_email?: string,
  display_color?: string
  company?: string | null
  tags?: string[]
  role_id?: number | null
  role_name?: string | null
  role?: Role | null

}
export type RsyncResult = { ok?: boolean; error?: string }
export type ExistingUser = {
  id?: string | number
  username: string
  name?: string
  user_email?: string
  display_color?: string
  company?: string | null
  tags?: string[]
  role_id?: number | null
  role_name?: string | null
  role?: Role | null
  default_role_id?: number | null
  default_role_name?: string | null
  default_role?: Role | null
}

export type Group = {
  id: number
  name: string
  description?: string | null
  display_color?: string | null
  member_count?: number
  members?: GroupMember[]
  created_at?: string
  updated_at?: string
}

export type GroupMember = {
  membership_id?: number
  user_id: number
  user_name?: string
  name?: string
  user_email?: string
  display_color?: string | null
  company?: string | null
  tags_json?: string | null
  joined_at?: string
}

export type GroupAccessRow = {
  group_id: number
  group_name: string
  group_description?: string | null
  group_color?: string | null
  member_count?: number
  role_id?: number | null
  role_name?: string | null
  role?: {
    id: number
    name: string
    permissions: {
      view: boolean
      comment: boolean
      download: boolean
      upload: boolean
    }
  } | null
  granted_at?: string | null
}

export type TranscodeOptions = {
  inputPath: string
  quality: 'original' | '1080p' | '720p'
  outputFormat: 'mp4' | 'hevc'
  useHardwareAccel: boolean
  preset?: 'fast' | 'balanced' | 'quality'
  watermarkPath?: string
}

export type TranscodeProgress = {
  percent: number
  fps: number
  speed: string
  eta: string
  message: string
}

export type TranscodeResult = { ok?: boolean; outputPath?: string; error?: string }

export type FullTranscodeOptions = {
  inputPath: string
  proxyQualities: ('720p' | '1080p' | 'original')[]
  generateHls: boolean
  watermarkPath?: string
  useHardwareAccel: boolean
  preset?: 'fast' | 'balanced' | 'quality'
}

export type FullTranscodeProgress = {
  phase: 'probe' | 'proxy' | 'hls'
  activeQuality?: string
  perQualityProgress: Record<string, number>
  overallPercent: number
  fps: number
  speed: string
  eta: string
  message: string
}

export type FullTranscodeResult = {
  ok?: boolean
  outputDir?: string
  proxyFiles?: Record<string, string>
  hlsDir?: string | null
  hlsMaster?: string | null
  error?: string
}

export interface ElectronApi {
  ipcRenderer: {
    send: (channel: string, data?: any) => void
    on: (
      channel: string,
      listener: (event: IpcRendererEvent, ...args: any[]) => void
    ) => void
    invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>
    once?: (
      channel: string,
      listener: (event: IpcRendererEvent, ...args: any[]) => void
    ) => void
    removeListener?: (channel: string, listener: (...args: any[]) => void) => void
    removeAllListeners?: (channel: string) => void
  }

  // dialogs / misc
  selectFolder: () => Promise<string | null>
  getOS: () => Promise<string>
  isFirstRunNeeded: (host: string, share: string, smbUser: string) => Promise<boolean>

  // local picks
  pickFiles: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickFolder: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickWatermark: () => Promise<{ path: string; name: string; size: number; dataUrl?: string | null } | null>

  /** -------- rsync over SSH (recommended path) -------- */
  rsyncStart: (
    opts: RsyncOpts,
    onProgress?: (p: RsyncProgress) => void
  ) => Promise<{ id: string; done: Promise<RsyncResult> }>

  rsyncCancel: (id: string) => void

  // Persisted uploads (detached rsync)
  listPersistedUploads: () => Promise<Array<{
    id: string
    fileName: string
    fileSize?: number
    host: string
    destDir: string
    startedAt: number
    status: string
  }>>

  /** Subscribe to progress for an already-running detached rsync */
  listenUploadProgress: (id: string, onProgress: (p: RsyncProgress) => void) => () => void

  /** -------- Client-side Transcoding -------- */
  transcodeStart: (
    options: TranscodeOptions,
    onProgress?: (p: TranscodeProgress) => void
  ) => Promise<{ jobId: string; done: Promise<TranscodeResult> }>

  transcodeCancel: (jobId: string) => void

  /** Full multi-output transcode (proxies + HLS) */
  fullTranscodeStart: (
    options: FullTranscodeOptions,
    onProgress?: (p: FullTranscodeProgress) => void
  ) => Promise<{ jobId: string; done: Promise<FullTranscodeResult> }>

  fullTranscodeCancel: (jobId: string) => void

  /** Remove a transcode temp directory after rsync */
  cleanupTranscodeTemp: (dirPath: string) => Promise<{ ok: boolean; error?: string }>
  /** Remove a downloaded watermark temp file */
  cleanupWatermarkTemp: (filePath: string) => Promise<{ ok: boolean; error?: string }>

  /** Download a watermark image from the server to a local temp file */
  downloadWatermark: (opts: { apiBase: string; token: string; relPath: string }) => Promise<string | null>

  /** Get hardware acceleration capabilities */
  getTranscodeCapabilities: () => Promise<{
    hasHardwareAccel: boolean
    bestCodecH264: string
    bestCodecHevc: string
    hardwareDescription: string
    ffmpegSource: 'system' | 'bundled'
    ffmpegVersion: string
    probeResults: Record<string, boolean>
  }>

  /** Persist the upload queue for crash recovery */
  persistUploadQueue: (items: any[]) => Promise<void>

  /** Get the real filesystem path for a File from drag-and-drop (replaces deprecated File.path) */
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronApi
    electronAPI: ElectronApi

    /** New structured logging bridge → handled by main on 'log:info|warn|error' */
    appLog?: {
      info: (event: string, data?: any) => void
      warn: (event: string, data?: any) => void
      error: (event: string, data?: any) => void
    }

    /** (Optional) keep legacy logger if you still use it anywhere */
    logger?: {
      log: (...a: any[]) => void
      warn: (...a: any[]) => void
      error: (...a: any[]) => void
    }
  }
}
export { }
