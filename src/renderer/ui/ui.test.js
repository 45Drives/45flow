import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import FlowModal from './FlowModal.vue'
import FlowField from './FlowField.vue'
import FlowButton from './FlowButton.vue'
import FlowNotice from './FlowNotice.vue'
import { openModalCount } from './useModalStack'

const apps = []

function mount(render) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render })
  app.mount(host)
  apps.push({ app, host })
  return host
}

const flush = async () => { await nextTick(); await nextTick() }
const panels = () => Array.from(document.querySelectorAll('.flow-modal__panel'))
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

afterEach(() => {
  while (apps.length) {
    const { app, host } = apps.pop()
    app.unmount()
    host.remove()
  }
  document.body.innerHTML = ''
})

describe('FlowModal', () => {
  it('renders an accessible dialog with a dismiss-styled close button', async () => {
    const open = ref(true)
    mount(() => h(FlowModal, { modelValue: open.value, title: 'New Project', description: 'Pick a folder' }, () => 'Body'))
    await flush()

    const panel = panels()[0]
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(panel.getAttribute('aria-labelledby'))
    expect(title.textContent).toBe('New Project')
    expect(document.getElementById(panel.getAttribute('aria-describedby')).textContent).toBe('Pick a folder')
    const close = panel.querySelector('header button')
    expect(close.className).toContain('btn-dismiss')
    expect(close.textContent.trim()).toBe('Close')
  })

  it.each(['button', 'escape', 'backdrop'])('closes through the %s', async (trigger) => {
    const open = ref(true)
    const onClose = vi.fn()
    mount(() => h(FlowModal, {
      modelValue: open.value,
      title: 'T',
      'onUpdate:modelValue': (v) => { open.value = v },
      onClose,
    }))
    await flush()
    if (trigger === 'button') document.querySelector('.flow-modal__header button').click()
    if (trigger === 'escape') pressEscape()
    if (trigger === 'backdrop') document.querySelector('.flow-modal__backdrop').click()
    await flush()
    expect(open.value).toBe(false)
    expect(onClose).toHaveBeenCalledWith(trigger === 'button' ? 'close' : trigger)
  })

  it('stays open while busy or when closeOnBackdrop is off', async () => {
    const open = ref(true)
    const busy = ref(true)
    mount(() => h(FlowModal, {
      modelValue: open.value,
      busy: busy.value,
      closeOnBackdrop: false,
      'onUpdate:modelValue': (v) => { open.value = v },
    }))
    await flush()
    pressEscape()
    document.querySelector('.flow-modal__header button').click()
    await flush()
    expect(open.value).toBe(true)

    busy.value = false
    await flush()
    document.querySelector('.flow-modal__backdrop').click()
    await flush()
    expect(open.value).toBe(true)
  })

  it('lets beforeClose veto closing', async () => {
    const open = ref(true)
    const beforeClose = vi.fn(async () => false)
    mount(() => h(FlowModal, { modelValue: open.value, beforeClose, 'onUpdate:modelValue': (v) => { open.value = v } }))
    await flush()
    pressEscape()
    await flush()
    expect(beforeClose).toHaveBeenCalledWith('escape')
    expect(open.value).toBe(true)
  })

  it('stacks nested modals in open order and sends Escape to the top one only', async () => {
    const outer = ref(true)
    const inner = ref(false)
    mount(() => [
      h(FlowModal, { modelValue: outer.value, title: 'Outer', 'onUpdate:modelValue': (v) => { outer.value = v } }),
      h(FlowModal, { modelValue: inner.value, title: 'Inner', 'onUpdate:modelValue': (v) => { inner.value = v } }),
    ])
    await flush()
    inner.value = true
    await flush()

    expect(openModalCount()).toBe(2)
    const [outerRoot, innerRoot] = Array.from(document.querySelectorAll('.flow-modal'))
    expect(outerRoot.style.zIndex).toContain('+ 0')
    expect(innerRoot.style.zIndex).toContain('+ 10')

    pressEscape()
    await flush()
    expect(inner.value).toBe(false)
    expect(outer.value).toBe(true)

    pressEscape()
    await flush()
    expect(outer.value).toBe(false)
    expect(openModalCount()).toBe(0)
  })

  it('focuses [autofocus] content on open and forwards attrs to the panel', async () => {
    mount(() => h(FlowModal, { modelValue: true, title: 'T', 'data-tour': 'x', class: 'h-96' }, () => h('input', { autofocus: true, id: 'first' })))
    await flush()
    expect(document.activeElement?.id).toBe('first')
    const panel = panels()[0]
    expect(panel.dataset.tour).toBe('x')
    expect(panel.className).toContain('h-96')
  })
})

describe('FlowField', () => {
  it('links label, help and error to the control', async () => {
    const host = mount(() => h(FlowField, { label: 'Project name', help: 'Shown to clients', error: 'Required', required: true }, {
      default: ({ id, describedBy }) => h('input', { id, 'aria-describedby': describedBy, class: 'input-textlike' }),
    }))
    await flush()
    const input = host.querySelector('input')
    const label = host.querySelector('label')
    expect(label.getAttribute('for')).toBe(input.id)
    const described = input.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent)
    expect(described).toEqual(['Shown to clients', 'Required'])
    expect(host.querySelector('.flow-field').className).toContain('flow-field--invalid')
  })

  it('keeps an explicit id', async () => {
    const host = mount(() => h(FlowField, { label: 'Name', id: 'new-project-name' }, {
      default: ({ id }) => h('input', { id }),
    }))
    await flush()
    expect(host.querySelector('label').getAttribute('for')).toBe('new-project-name')
    expect(host.querySelector('input').id).toBe('new-project-name')
  })
})

describe('FlowButton and FlowNotice', () => {
  it('maps variants and sizes onto the shared classes', async () => {
    const host = mount(() => h(FlowButton, { variant: 'dismiss', size: 'xs', loading: true, loadingText: 'Saving…' }, () => 'Cancel'))
    await flush()
    const button = host.querySelector('button')
    expect(button.className).toBe('btn btn-dismiss btn-xs')
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Saving…')
    expect(button.type).toBe('button')
  })

  it('renders tone classes and live roles', async () => {
    const host = mount(() => h(FlowNotice, { tone: 'danger', title: 'Low space', live: true }, () => 'Only 2 GB left'))
    await flush()
    const notice = host.querySelector('.flow-notice')
    expect(notice.className).toContain('flow-notice--danger')
    expect(notice.getAttribute('role')).toBe('alert')
    expect(notice.textContent).toContain('Low space')
  })
})
