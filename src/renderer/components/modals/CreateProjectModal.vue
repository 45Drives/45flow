<template>
	<FlowModal
		:model-value="modelValue"
		title="New Project"
		description="A project is a folder on your server for one job or production. Everything you share for it lives in that folder."
		size="xl"
		hide-close
		:busy="creating"
		@update:model-value="(v) => emit('update:modelValue', v)"
	>
		<form id="create-project-form" @submit.prevent="submit" class="flex flex-col gap-4">
			<FlowField label="Project name" id="new-project-name" required>
				<template #default="{ id }">
					<input
						:id="id"
						v-model="name"
						type="text"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
						placeholder="e.g. Spring Campaign Edit"
						required
						autofocus
					/>
				</template>
			</FlowField>
			<FlowField label="Project folder" id="new-project-folder">
				<p class="flow-field__help -mt-0.5 mb-1">Pick the folder that holds this project's media. Use <b>New Folder</b> in the browser below to make one.</p>
				<FolderPicker
					v-model="rootDir"
					:apiFetch="apiFetch"
					useCase="upload"
					subtitle=""
					:auto-detect-roots="true"
					:allow-entire-tree="true"
					:is-root-user="isRootUser"
					v-model:project="pickerBase"
					v-model:dest="rootDir"
				/>
				<FolderSpaceNotice :path="finalRootDir" :apiFetch="apiFetch" />
			</FlowField>
			<FlowField label="Notes" id="new-project-description" optional>
				<template #default="{ id }">
					<textarea
						:id="id"
						v-model="description"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none"
						rows="2"
						placeholder="Client, deliverables, anything your team should know…"
					/>
				</template>
			</FlowField>
		</form>
		<template #footer>
			<button type="button" class="btn btn-dismiss px-4 py-2" :disabled="creating" @click="close">Cancel</button>
			<button type="submit" form="create-project-form" class="btn btn-primary px-4 py-2" :disabled="!canCreate">
				{{ creating ? 'Creating…' : 'Create Project' }}
			</button>
		</template>
	</FlowModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Notification } from '@45drives/houston-common-ui'
import { useApi } from '../../composables/useApi'
import { useConnections } from '../../composables/useConnections'
import { pushNotification } from '../../composables/useNotificationQueue'
import FolderPicker from '../FolderPicker.vue'
import FolderSpaceNotice from '../FolderSpaceNotice.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowField from '../../ui/FlowField.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
	(e: 'update:modelValue', v: boolean): void
	(e: 'created', project: { id: number; name: string; root_dir: string; description: string | null }): void
}>()

const { apiFetch } = useApi()
const { activeConnection } = useConnections()
const isRootUser = computed(() => activeConnection.value?.username === 'root')

const name = ref('')
const rootDir = ref('')
const pickerBase = ref('')
const description = ref('')
const creating = ref(false)

const finalRootDir = computed(() => rootDir.value.trim())

const canCreate = computed(() => !!name.value.trim() && !!finalRootDir.value && !creating.value)

function reset() {
	name.value = ''
	rootDir.value = ''
	pickerBase.value = ''
	description.value = ''
}

watch(() => props.modelValue, (open) => { if (!open) reset() })

function close() {
	emit('update:modelValue', false)
}

async function submit() {
	if (!canCreate.value) return
	creating.value = true
	try {
		const data = await apiFetch('/api/projects', {
			method: 'POST',
			body: JSON.stringify({
				name: name.value.trim(),
				rootDir: finalRootDir.value,
				description: description.value.trim() || null,
			}),
		})
		const project = data?.project
		emit('update:modelValue', false)
		if (project) emit('created', project)
	} catch (e: any) {
		pushNotification(new Notification('Couldn\'t create the project', e?.message || '', 'error', 8000))
	} finally {
		creating.value = false
	}
}
</script>
