<template>
  <div v-if="allConnectedServers.length > 1" class="flex items-center gap-2">
    <label class="text-sm font-medium whitespace-nowrap">Show links from:</label>
    <select 
      v-model="selectedFilter" 
      @change="handleChange"
      class="min-w-[200px] px-3 py-2 border border-default rounded-md bg-default text-default text-sm cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
    >
      <option value="all">All Servers ({{ allConnectedServers.length }})</option>
      <option 
        v-for="conn in allConnectedServers" 
        :key="conn.connectionId"
        :value="conn.connectionId"
      >
        {{ conn.name }} ({{ conn.serverIp }})
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { useServerFilter } from '../composables/useServerFilter'

const { selectedFilter, setFilter, allConnectedServers } = useServerFilter()

function handleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  setFilter(value)
}
</script>
