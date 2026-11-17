<template>
	<FlowModal
		:model-value="modelValue"
		:title="project ? 'Edit Project' : 'New Project'"
		description="A project is a folder on your server for one job or production. Everything you share for it lives in that folder."
		size="xl"
		hide-close
		:busy="creating"
		@update:model-value="(v) => emit('update:modelValue', v)"
	>
		<form id="create-project-form" @submit.self.prevent="submit" class="flex flex-col gap-4">
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
					v-if="modelValue"
					v-model="rootDir"
					:apiFetch="apiFetch"
					useCase="upload"
					subtitle=""
					:auto-detect-roots="!storageRoot"
					:base="storageRoot"
					:start-dir="project?.root_dir || storageRoot"
					:hide-project-controls="!!storageRoot"
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
			<p v-if="createBlockedReason" class="text-sm text-muted mr-auto self-center" role="status" data-testid="create-project-blocked">
				{{ createBlockedReason }}
			</p>
			<button type="button" class="btn btn-dismiss px-4 py-2" :disabled="creating" @click="close">Cancel</button>
			<button type="submit" form="create-project-form" class="btn btn-primary px-4 py-2" :disabled="!canCreate">
				{{ creating ? (project ? 'Saving…' : 'Creating…') : (project ? 'Save changes' : 'Create Project') }}
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

export type ProjectDetails = { id: number; name: string; root_dir: string; description: string | null }
const props = defineProps<{ modelValue: boolean; storageRoot?: string; project?: ProjectDetails; connectionId?: string }>()
const emit = defineEmits<{
	(e: 'update:modelValue', v: boolean): void
	(e: 'created', project: ProjectDetails): void
	(e: 'saved', project: ProjectDetails): void
}>()

const { apiFetch } = useApi(props.connectionId)
const { activeConnection } = useConnections()
const isRootUser = computed(() => activeConnection.value?.username === 'root')

const name = ref('')
const rootDir = ref('')
const pickerBase = ref('')
const description = ref('')
const creating = ref(false)

const finalRootDir = computed(() => rootDir.value.trim())

const canCreate = computed(() => !!name.value.trim() && !!finalRootDir.value && !creating.value)

// Says what's still needed while Create Project is disabled, so it's never disabled without a reason.
const createBlockedReason = computed(() => {
	if (creating.value) return ''
	const needsName = !name.value.trim()
	const needsFolder = !finalRootDir.value
	if (needsName && needsFolder) return 'Enter a project name and choose a project folder to continue.'
	if (needsName) return 'Enter a project name to continue.'
	if (needsFolder) return 'Choose a project folder to continue.'
	return ''
})

function reset(open = false) {
	name.value = open ? props.project?.name || '' : ''
	rootDir.value = open ? props.project?.root_dir || '' : ''
	pickerBase.value = ''
	description.value = open ? props.project?.description || '' : ''
}

watch(() => props.modelValue, open => reset(open), { immediate: true })

function close() {
	emit('update:modelValue', false)
}

async function submit() {
	if (!canCreate.value) return
	creating.value = true
	try {
		const data = await apiFetch(props.project ? `/api/projects/${props.project.id}` : '/api/projects', {
			method: props.project ? 'PATCH' : 'POST',
			retry: 0,
			body: JSON.stringify({
				name: name.value.trim(),
				rootDir: finalRootDir.value,
				description: description.value.trim() || null,
			}),
		})
		const project = data?.project
		if (!project) throw new Error('The server did not return the saved project. Refresh the project list before trying again.')
		emit('update:modelValue', false)
		if (props.project) emit('saved', project)
		else emit('created', project)
	} catch (e: any) {
		pushNotification(new Notification(props.project ? 'Couldn\'t save the project' : 'Couldn\'t create the project', e?.message || '', 'error', 8000))
	} finally {
		creating.value = false
	}
}
</script>
