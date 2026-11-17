import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'

let app, host
afterEach(() => { app?.unmount(); host?.remove() })

it.each([true, false])('keeps dismissal distinct from confirmation (closeIsCancel=%s)', async (closeIsCancel) => {
    const cancel = vi.fn(), close = vi.fn(), confirm = vi.fn(), update = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(ConfirmDeleteModal, {
        modelValue: true, closeIsCancel,
        onCancel: cancel, onClose: close, onConfirm: confirm,
        'onUpdate:modelValue': update,
    })
    app.mount(host)
    await nextTick()
    document.querySelector('.flow-modal__header button').click()
    await nextTick()
    expect(update).toHaveBeenCalledExactlyOnceWith(false)
    expect(closeIsCancel ? cancel : close).toHaveBeenCalledTimes(1)
    expect(closeIsCancel ? close : cancel).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
})
