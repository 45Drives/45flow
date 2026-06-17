<template>
	<Teleport to="body">
		<div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-default" @click.self="close">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-4xl mx-4 bg-accent">
				<h3 class="text-lg font-semibold mb-4">Create New Project</h3>
				<form @submit.prevent="submit" class="flex flex-col gap-4">
					<div>
						<label class="block text-sm font-medium mb-1">Project Name</label>
						<input
							v-model="name"
							type="text"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
							placeholder="My Video Project"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Project Root Directory</label>
						<FolderPicker
							v-model="rootDir"
							:apiFetch="apiFetch"
							useCase="upload"
							subtitle="Choose the root directory for this project."
							:auto-detect-roots="true"
							:allow-entire-tree="true"
							v-model:project="pickerBase"
							v-model:dest="rootDir"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Description (optional)</label>
						<textarea
							v-model="description"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none"
							rows="2"
							placeholder="Brief description of this project…"
						/>
					</div>
					<div class="flex items-center justify-end gap-2 mt-2">
						<button type="button" class="btn btn-secondary px-4 py-2" @click="close">Cancel</button>
						<button type="submit" class="btn btn-primary px-4 py-2" :disabled="!name.trim() || !rootDir.trim() || creating">
							{{ creating ? 'Creating…' : 'Create Project' }}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Notification } from '@45drives/houston-common-ui'
import { useApi } from '../../composables/useApi'
import { pushNotification } from '../../composables/useNotificationQueue'
import FolderPicker from '../FolderPicker.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
	(e: 'update:modelValue', v: boolean): void
	(e: 'created', project: { id: number; name: string; root_dir: string; description: string | null }): void
}>()

const { apiFetch } = useApi()

const name = ref('')
const rootDir = ref('')
const pickerBase = ref('')
const description = ref('')
const creating = ref(false)

function close() {
	emit('update:modelValue', false)
}

async function submit() {
	if (!name.value.trim() || !rootDir.value.trim()) return
	creating.value = true
	try {
		const data = await apiFetch('/api/projects', {
			method: 'POST',
			body: JSON.stringify({
				name: name.value.trim(),
				rootDir: rootDir.value.trim(),
				description: description.value.trim() || null,
			}),
		})
		name.value = ''
		rootDir.value = ''
		pickerBase.value = ''
		description.value = ''
		emit('update:modelValue', false)
		emit('created', data?.project || { id: data?.project?.id, name: name.value, root_dir: rootDir.value, description: description.value })
	} catch (e: any) {
		pushNotification(new Notification('Failed to create project', e?.message || '', 'error', 8000))
	} finally {
		creating.value = false
	}
}
</script>
