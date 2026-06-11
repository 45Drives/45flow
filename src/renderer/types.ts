export type { Server, DivisionType, SavedServer } from '../shared/types';
import type { Server } from '../shared/types';

export interface DiscoveryState {
  servers: Server[]
  fallbackTriggered: boolean
}

export interface ConnectionMeta {
  /** Bearer token returned by /api/login */
  token?: string;

  /** TCP port the broadcaster listens on (default 9095) */
  port?: number;

  /**
   * If the remote server advertises an HTTPS host (e.g., box-a.protocase.local),
   * we store it here so the UI can show where we’re connected.
   */
  httpsHost?: string;

  /**
   * Base URL to call for API requests:
   *  - "" (empty string) → same-origin (browser dev behind Caddy)
   *  - "https://box-a.protocase.local" → remote box over HTTPS (browser/electron)
   *  - "http://192.168.x.x:9095" → electron-only fallback when no HTTPS
   */
  apiBase?: string;
  ssh?:{server:string; username:string; port: number | undefined; keyPath?: string;}
}
