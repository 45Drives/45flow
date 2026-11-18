<template>
	<FlowField v-if="supported" label=".45flow folder visibility"
		help="Only affects the .45flow folder in server file browsers. Other hidden files and folders stay hidden.">
		<template #default="{ id, describedBy }">
			<select :id="id" :aria-describedby="describedBy" v-model="visibility"
				class="input-textlike w-full px-3 py-2 rounded-lg border border-default">
				<option :value="null">Use server default{{ defaultLabel }}</option>
				<option :value="true">Show .45flow</option>
				<option :value="false">Hide .45flow</option>
			</select>
		</template>
	</FlowField>
	<FlowNotice v-else-if="loadError" tone="danger" size="sm" title="Couldn't load folder visibility">
		{{ loadError }}
	</FlowNotice>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const visibility = defineModel<boolean | null>({ required: true })
const { apiFetch } = useApi()
const supported = ref(false)
const showByDefault = ref(false)
const loadError = ref('')
const defaultLabel = computed(() => showByDefault.value ? ' (shown)' : ' (hidden)')

onMounted(async () => {
	try {
		const data = await apiFetch('/api/projects')
		if (typeof data?.showFlowFolderDefault === 'boolean') {
			showByDefault.value = data.showFlowFolderDefault
			supported.value = true
		}
	} catch (error) {
		loadError.value = error instanceof Error ? error.message : 'Try again after reconnecting to the server.'
	}
})
</script>
