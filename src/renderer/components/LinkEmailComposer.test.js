import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import LinkEmailComposer from './LinkEmailComposer.vue'

let app
let host
async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}
function mount(initialPeople = []) {
  const people = ref(initialPeople)
  const enabled = ref(false)
  const recipients = ref([])
  const invalid = ref([])
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(LinkEmailComposer, {
      people: people.value,
      modelValue: enabled.value,
      'onUpdate:modelValue': (v) => { enabled.value = v },
      'onUpdate:recipients': (v) => { recipients.value = v },
      'onUpdate:invalid': (v) => { invalid.value = v },
    }),
  })
  app.mount(host)
  return { people, enabled, recipients, invalid }
}
function typeAddresses(value) {
  const input = host.querySelector('input[type="email"]')
  input.value = value
  input.dispatchEvent(new Event('input'))
}

afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('LinkEmailComposer', () => {
  it('turns on and ticks invited people with an email when they are added', async () => {
    const s = mount()
    await flush()
    expect(s.enabled.value).toBe(false)
    expect(host.querySelector('input[type="email"]')).toBeNull()
    s.people.value = [{ name: 'Ann', email: 'Ann@Client.test' }, { name: 'No Mail', email: null }]
    await flush()
    expect(s.enabled.value).toBe(true)
    const boxes = [...host.querySelectorAll('input[type="checkbox"]')]
    expect(boxes[0].checked).toBe(true)
    expect(boxes[1].disabled).toBe(true)
    expect(s.recipients.value).toEqual(['ann@client.test'])
  })

  it('combines ticked people with typed addresses, and reports bad entries', async () => {
    const s = mount([{ name: 'Ann', email: 'ann@client.test' }])
    await flush()
    typeAddresses('bo@x.test, ann@client.test; nope')
    await flush()
    expect(s.recipients.value).toEqual(['ann@client.test', 'bo@x.test'])
    expect(s.invalid.value).toEqual(['nope'])
    typeAddresses('bo@x.test')
    host.querySelector('input[type="checkbox"]').click()
    await flush()
    expect(s.recipients.value).toEqual(['bo@x.test'])
  })

  it('sends to nobody when switched off', async () => {
    const s = mount([{ name: 'Ann', email: 'ann@client.test' }])
    await flush()
    host.querySelector('[role="switch"]').click()
    await flush()
    expect(s.enabled.value).toBe(false)
    expect(s.recipients.value).toEqual([])
    // Adding someone else later doesn't switch it back on.
    s.people.value = [...s.people.value, { name: 'Bo', email: 'bo@client.test' }]
    await flush()
    expect(s.enabled.value).toBe(false)
  })
})
