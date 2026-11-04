export interface ConnectionCredentials {
  token: string
  savedPassword?: string
}

export interface CredentialStorageStatus {
  persistent: boolean
}

export interface SecureTokenApi {
  status: () => Promise<CredentialStorageStatus>
  get: (connectionId: string) => Promise<ConnectionCredentials | null>
  set: (connectionId: string, credentials: ConnectionCredentials) => Promise<CredentialStorageStatus>
  clear: (connectionId: string) => Promise<void>
}
