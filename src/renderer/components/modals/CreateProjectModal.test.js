import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

vi.mock('@45drives/houston-common-ui', () => ({ Notification: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: vi.fn() }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: { value: null } }) }))
vi.mock('../../composables/useNotificationQueue', () => ({ pushNotification: vi.fn() }))
vi.mock('../FolderPicker.vue', () => ({
  default: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        'data-testid': 'folder',
        value: props.modelValue,
        onInput: e => emit('update:modelValue', e.target.value),
      })
    },
  }),
}))
vi.mock('../FolderSpaceNotice.vue', () => ({ default: defineComponent({ render: () => null }) }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: defineComponent({ setup: (_p, { slots }) => () => h('div', [slots.default?.(), slots.footer?.()]) }),
}))
vi.mock('../../ui/FlowField.vue', () => ({
  default: defineComponent({ props: ['id'], setup: (p, { slots }) => () => h('div', slots.default?.({ id: p.id })) }),
}))

import CreateProjectModal from './CreateProjectModal.vue'

let app
let root
afterEach(() => { app?.unmount(); root?.remove() })

async function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(CreateProjectModal, { modelValue: true })
  app.mount(root)
  await nextTick()
}

const hint = () => root.querySelector('[data-testid="create-project-blocked"]')?.textContent.trim() || ''
const createButton = () => root.querySelector('button[type="submit"]')

async function type(el, value) {
  el.value = value
  el.dispatchEvent(new Event('input'))
  await nextTick()
}

describe('CreateProjectModal disabled-Create hint', () => {
  it('says what is missing and clears once the form is complete', async () => {
    await mount()
    expect(createButton().disabled).toBe(true)
    expect(hint()).toBe('Enter a project name and choose a project folder to continue.')

    await type(root.querySelector('#new-project-name'), 'Spring Edit')
    expect(hint()).toBe('Choose a project folder to continue.')

    await type(root.querySelector('[data-testid="folder"]'), '/home/me/Downloads/flowtesting')
    expect(hint()).toBe('')
    expect(createButton().disabled).toBe(false)

    await type(root.querySelector('#new-project-name'), '   ')
    expect(hint()).toBe('Enter a project name to continue.')
    expect(createButton().disabled).toBe(true)
  })
})
