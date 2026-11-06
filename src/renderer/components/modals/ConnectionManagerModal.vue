<template>
  <FlowModal :model-value="modelValue" title="Server Connections" size="xl" @close="close">

      <!-- Active Connection Badge -->
      <div v-if="activeConnection" class="mb-4 p-3 bg-well rounded-md border border-primary/30">
        <div class="text-sm text-muted mb-1">Active Connection</div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full" :class="{
            'bg-flow-success': activeConnection.status === 'connected',
            'bg-flow-danger': activeConnection.status === 'disconnected' || activeConnection.status === 'error',
            'bg-flow-warning': activeConnection.status === 'checking'
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
              <div class="flex-1 min-w-0 text-left">
                <!-- Name and Status -->
                <div class="flex items-center gap-2 mb-1">
                  <button
                    class="text-flow-warning hover:text-flow-warning"
                    :class="{ 'opacity-30': !conn.isFavorite }"
                    @click.stop="toggleFavorite(conn.connectionId)"
                    :title="conn.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
                  >
                    ★
                  </button>
                  <span class="inline-block w-2 h-2 rounded-full" :class="{
                    'bg-flow-success': conn.status === 'connected',
                    'bg-flow-danger': conn.status === 'disconnected' || conn.status === 'error',
                    'bg-flow-warning': conn.status === 'checking'
                  }" />
                  <span class="font-semibold truncate">{{ conn.name }}</span>
                  <span v-if="conn.isActive" class="text-xs bg-primary text-white px-2 py-0.5 rounded">Active</span>
                </div>

                <!-- Details -->
                <div class="text-sm text-muted space-y-0.5">
                  <div>IP: {{ conn.serverIp }}</div>
                  <div>User: {{ conn.username }}</div>
                  <div>
                    Status: <span :class="conn.token && conn.status === 'connected' ? 'text-flow-success' : 'text-flow-warning'">
                      {{ !conn.token ? 'Logged out' : conn.status === 'connected' ? 'Connected' : 'Reconnect required' }}
                    </span>
                  </div>
                  <div v-if="conn.licensed !== undefined">
                    License: <span :class="conn.licensed ? 'text-flow-success' : 'text-flow-warning'">
                      {{ conn.licensed ? 'Licensed' : 'Unlicensed' }}
                    </span>
                  </div>
                  <div>Last connected: {{ formatDate(conn.lastConnectedAt) }}</div>
                  <div v-if="conn.lastError" class="text-flow-danger">Error: {{ conn.lastError }}</div>
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
      <template #footer>
        <div class="text-sm text-muted mr-auto">
          {{ sortedConnections.length }} connection{{ sortedConnections.length !== 1 ? 's' : '' }}
        </div>
        <button class="btn btn-primary" @click="addServer">
          + Add Server
        </button>
      </template>
  </FlowModal>

  <!-- Confirm Remove Dialog -->
  <FlowModal :model-value="!!removeConfirmFor" title="Remove Connection?" size="sm" hide-close @close="removeConfirmFor = null">
      <p class="text-sm text-muted">
        Are you sure you want to remove the connection to <strong>{{ removeConfirmFor?.name }}</strong>?
        This will cancel any active uploads or transcodes on this server.
      </p>
      <template #footer>
        <button class="btn btn-dismiss" @click="removeConfirmFor = null">Cancel</button>
        <button class="btn btn-danger" @click="removeConnection">Remove</button>
      </template>
  </FlowModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnections } from '../../composables/useConnections'
import type { Connection } from '../../composables/useConnections'
import { useRouter } from 'vue-router'
import FlowModal from '../../ui/FlowModal.vue'

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
