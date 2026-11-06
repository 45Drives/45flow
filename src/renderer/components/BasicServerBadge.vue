<template>
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium text-default whitespace-nowrap">Connected to:</span>
    <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-default">
      <span class="inline-block w-2 h-2 rounded-full" :class="{
        'bg-flow-success': activeConnection?.status === 'connected',
        'bg-flow-danger': activeConnection?.status === 'disconnected' || activeConnection?.status === 'error',
        'bg-flow-warning': activeConnection?.status === 'checking'
      }" />
      <span class="text-sm font-medium w-[120px] truncate">
        {{ activeConnection?.name || 'No Connection' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConnections } from '../composables/useConnections'

const { activeConnection } = useConnections()
</script>
