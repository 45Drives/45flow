import { ref, computed } from 'vue'

export interface ActiveProjectInfo {
  id: number
  name: string
  root_dir: string
}

const activeProjectId = ref<number | null>(null)
const activeProjectName = ref('')
const activeProjectRoot = ref('')

export function useActiveProject() {
  const activeProject = computed<ActiveProjectInfo | null>(() => {
    if (!activeProjectId.value) return null
    return { id: activeProjectId.value, name: activeProjectName.value, root_dir: activeProjectRoot.value }
  })

  function setActiveProject(project: { id: number; name: string; root_dir: string } | null) {
    if (project) {
      activeProjectId.value = project.id
      activeProjectName.value = project.name
      activeProjectRoot.value = project.root_dir
    } else {
      activeProjectId.value = null
      activeProjectName.value = ''
      activeProjectRoot.value = ''
    }
  }

  return { activeProject, activeProjectId, setActiveProject }
}
