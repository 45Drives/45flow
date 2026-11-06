<template>
	<Teleport to="body">
		<div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-default" @click.self="close">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-4xl mx-4 bg-accent max-h-[92vh] overflow-y-auto">
				<h3 class="text-lg font-semibold">New Project</h3>
				<p class="text-sm opacity-80 mb-4">A project is a folder on your server for one job or production. Everything you share for it lives in that folder.</p>
				<form @submit.prevent="submit" class="flex flex-col gap-4">
					<div>
						<label class="block text-sm font-medium mb-1" for="new-project-name">Project name</label>
						<input
							id="new-project-name"
							v-model="name"
							type="text"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
							placeholder="e.g. Spring Campaign Edit"
							required
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label class="block text-sm font-medium">Project folder</label>
						<p class="text-xs opacity-75 -mt-1">Pick the folder that holds this project's media. Use <b>New Folder</b> in the browser below to make one.</p>
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
					</div>
					<div>
						<label class="block text-sm font-medium mb-1" for="new-project-description">Notes (optional)</label>
						<textarea
							id="new-project-description"
							v-model="description"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none"
							rows="2"
							placeholder="Client, deliverables, anything your team should know…"
						/>
					</div>
					<div class="flex items-center justify-end gap-2 mt-2">
						<button type="button" class="btn btn-secondary px-4 py-2" @click="close">Cancel</button>
						<button type="submit" class="btn btn-primary px-4 py-2" :disabled="!canCreate">
							{{ creating ? 'Creating…' : 'Create Project' }}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Notification } from '@45drives/houston-common-ui'
import { useApi } from '../../composables/useApi'
import { useConnections } from '../../composables/useConnections'
import { pushNotification } from '../../composables/useNotificationQueue'
import FolderPicker from '../FolderPicker.vue'
import FolderSpaceNotice from '../FolderSpaceNotice.vue'

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
