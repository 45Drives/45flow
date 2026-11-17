export interface Server {
  ip: string;
  name: string;
  lastSeen: number;
  status: "unknown" | "complete" | "not complete";
  setupComplete?: boolean;
  shareName?: string;
  serverName?: string;
  setupTime?: string;
  serverInfo?: {
    moboMake: string;
    moboModel: string;
    serverModel: string;
    aliasStyle: string;
    chassisSize: string;
  };
  manuallyAdded?: boolean;
  fallbackAdded?: boolean;
  registryDiscovered?: boolean;
}

export type DivisionType = 'default' | 'enterprise' | 'homelab' | 'professional' | 'studio';

export type SavedServer = {
  id: string;
  host: string;
  name?: string;
  username: string;
  favorite?: boolean;
  lastUsedAt?: number;
};
