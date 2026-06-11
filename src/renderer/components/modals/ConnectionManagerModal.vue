<template>
  <div v-if="modelValue" class="fixed inset-0 z-[2000] flex items-center justify-center" @click.self="close">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />
    <div class="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-accent rounded-lg shadow-xl p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Server Connections</h2>
        <button class="btn btn-secondary" @click="close">Close</button>
      </div>

      <!-- Active Connection Badge -->
      <div v-if="activeConnection" class="mb-4 p-3 bg-well rounded-md border border-primary/30">
        <div class="text-sm text-muted mb-1">Active Connection</div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full" :class="{
            'bg-green-500': activeConnection.status === 'connected',
            'bg-red-500': activeConnection.status === 'disconnected' || activeConnection.status === 'error',
            'bg-yellow-500': activeConnection.status === 'checking'
          }" />
          <span class="font-semibold">{{ activeConnection.name }}</span>
          <span class="text-muted text-sm">({{ activeConnection.serverIp }})</span>
        </div>
      </div>

      <!-- Connections List -->
      <div class="flex-1 min-h-0 overflow-y-auto mb-4">
        <div v-if="sortedConnections.length === 0" class="text-center py-8 text-muted">
          <p>No server connections yet.</p>
          <p class="text-sm mt-2">Add a server to get started.</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="conn in sortedConnections"
            :key="conn.connectionId"
            class="p-4 rounded-md border transition-colors cursor-pointer"
            :class="{
              'border-primary bg-well': conn.isActive,
              'border-default hover:border-primary/50': !conn.isActive
            }"
            @click="switchTo(conn.connectionId)"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <!-- Name and Status -->
                <div class="flex items-center gap-2 mb-1">
                  <button
                    class="text-yellow-500 hover:text-yellow-400"
                    :class="{ 'opacity-30': !conn.isFavorite }"
                    @click.stop="toggleFavorite(conn.connectionId)"
                    :title="conn.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
                  >
                    ★
                  </button>
                  <span class="inline-block w-2 h-2 rounded-full" :class="{
                    'bg-green-500': conn.status === 'connected',
                    'bg-red-500': conn.status === 'disconnected' || conn.status === 'error',
                    'bg-yellow-500': conn.status === 'checking'
                  }" />
                  <span class="font-semibold truncate">{{ conn.name }}</span>
                  <span v-if="conn.isActive" class="text-xs bg-primary text-white px-2 py-0.5 rounded">Active</span>
                </div>

                <!-- Details -->
                <div class="text-sm text-muted space-y-0.5">
                  <div>IP: {{ conn.serverIp }}</div>
                  <div>User: {{ conn.username }}</div>
                  <div v-if="conn.licensed !== undefined">
                    License: <span :class="conn.licensed ? 'text-green-500' : 'text-yellow-500'">
                      {{ conn.licensed ? 'Licensed' : 'Unlicensed' }}
                    </span>
                  </div>
                  <div>Last connected: {{ formatDate(conn.lastConnectedAt) }}</div>
                  <div v-if="conn.lastError" class="text-danger">Error: {{ conn.lastError }}</div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2">
                <button
                  class="btn btn-sm btn-secondary"
                  @click.stop="reconnect(conn)"
                  :title="'Reconnect to ' + conn.name"
                >
                  Reconnect
                </button>
                <button
                  v-if="!conn.isActive"
                  class="btn btn-sm btn-primary"
                  @click.stop="switchTo(conn.connectionId)"
                >
                  Switch
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  @click.stop="confirmRemove(conn)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Server Button -->
      <div class="flex justify-between items-center">
        <div class="text-sm text-muted">
          {{ sortedConnections.length }} connection{{ sortedConnections.length !== 1 ? 's' : '' }}
        </div>
        <button class="btn btn-primary" @click="addServer">
          + Add Server
        </button>
      </div>
    </div>
  </div>

  <!-- Confirm Remove Dialog -->
  <div v-if="removeConfirmFor" class="fixed inset-0 z-[2100] flex items-center justify-center" @click.self="removeConfirmFor = null">
    <div class="absolute inset-0 bg-black/50" />
    <div class="relative bg-accent rounded-lg shadow-xl p-6 max-w-md">
      <h3 class="text-lg font-semibold mb-2">Remove Connection?</h3>
      <p class="text-sm text-muted mb-4">
        Are you sure you want to remove the connection to <strong>{{ removeConfirmFor.name }}</strong>?
        This will cancel any active uploads or transcodes on this server.
      </p>
      <div class="flex justify-end gap-2">
        <button class="btn btn-secondary" @click="removeConfirmFor = null">Cancel</button>
        <button class="btn btn-danger" @click="removeConnection">Remove</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnections } from '../../composables/useConnections'
import type { Connection } from '../../composables/useConnections'
import { useRouter } from 'vue-router'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const router = useRouter()
const { connections, sortedConnections, activeConnection, setActive, removeConnection: removeConn, updateConnection } = useConnections()

const removeConfirmFor = ref<Connection | null>(null)

function close() {
  emit('update:modelValue', false)
}

function switchTo(connectionId: string) {
  setActive(connectionId)
}

function toggleFavorite(connectionId: string) {
  const conn = connections.find(c => c.connectionId === connectionId)
  if (conn) {
    updateConnection(connectionId, { isFavorite: !conn.isFavorite })
  }
}

function confirmRemove(conn: Connection) {
  removeConfirmFor.value = conn
}

function removeConnection() {
  if (removeConfirmFor.value) {
    removeConn(removeConfirmFor.value.connectionId)
    removeConfirmFor.value = null
  }
}

function addServer() {
  close()
  router.push({ name: 'server-selection', query: { skipAutoLogin: 'true' } })
}

function reconnect(conn: Connection) {
  close()
  // Navigate to server selection with pre-filled connection details
  router.push({ 
    name: 'server-selection', 
    query: { 
      reconnect: conn.connectionId,
      serverIp: conn.serverIp,
      username: conn.username
    } 
  })
}

function formatDate(timestamp: number) {
  const d = new Date(timestamp)
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`

  return d.toLocaleDateString()
}
</script>

<style scoped>
.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}
</style>
