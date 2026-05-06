/**
 * Transcode Backend Configuration
 * 
 * This module provides the abstraction layer for transcoding backends.
 * Currently supports local FFmpeg, with future support for remote workers.
 * 
 * Architecture:
 * - TranscodeBackend: enum of available backends (local, remote)
 * - TranscodeWorkerConfig: configuration for the active backend
 * - getActiveBackend(): Returns current backend based on user settings
 * - canUseRemoteWorker(): Checks if remote worker is available/configured
 */

/** Available transcode backend targets */
export enum TranscodeBackend {
  /** Local FFmpeg on client machine (free tier, default) */
  LOCAL = 'local',
  /** Remote transcode worker (premium feature, future) */
  REMOTE = 'remote',
}

/** Configuration for a remote transcode worker */
export interface RemoteTranscodeWorkerConfig {
  /** Host/IP of the remote transcode worker */
  host: string
  /** Port the worker is listening on (default: 9999) */
  port: number
  /** JWT token for authentication (if required) */
  apiToken?: string
  /** Optional DNS name for verification/TLS */
  verifyHostname?: string
  /** Optional custom CA certificate path for TLS */
  caPath?: string
}

/** Active transcode configuration */
export interface TranscodeConfig {
  /** Which backend to use */
  backend: TranscodeBackend
  /** Remote worker config (if backend === REMOTE) */
  remoteWorker?: RemoteTranscodeWorkerConfig
  /** Whether to fall back to local if remote fails (default: true) */
  fallbackToLocal?: boolean
}

/** Determines active transcode backend from user preferences */
export function getActiveTranscodeBackend(userPrefs?: any): TranscodeConfig {
  // TODO: In future, read from user settings/database
  // Check if user has remote worker configured and enabled
  // For now, always use local
  
  const remoteHost = userPrefs?.transcodeWorkerHost
  const remotePort = userPrefs?.transcodeWorkerPort || 9999
  const remoteToken = userPrefs?.transcodeWorkerToken

  if (remoteHost && remotePort) {
    return {
      backend: TranscodeBackend.REMOTE,
      remoteWorker: {
        host: remoteHost,
        port: remotePort,
        apiToken: remoteToken,
      },
      fallbackToLocal: true,
    }
  }

  return {
    backend: TranscodeBackend.LOCAL,
    fallbackToLocal: true,
  }
}

/** Check if remote worker is accessible and configured */
export async function canUseRemoteWorker(config: RemoteTranscodeWorkerConfig): Promise<boolean> {
  // TODO: Implement health check to remote worker
  // - Try to reach /health endpoint
  // - Verify authentication
  // - Check available GPU capacity
  // For now, return false (not yet implemented)
  return false
}

/** Serialize transcode config for transmission over IPC */
export function serializeTranscodeConfig(config: TranscodeConfig): string {
  return JSON.stringify(config)
}

/** Deserialize transcode config from IPC */
export function deserializeTranscodeConfig(json: string): TranscodeConfig {
  return JSON.parse(json)
}
