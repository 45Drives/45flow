import { defineComponent, h } from 'vue';

/** A settings line: label and help on the left, the control on the right. */
export default defineComponent({
    name: 'SettingRow',
    props: {
        label: { type: String, required: true },
        description: { type: String, default: '' },
    },
    setup(props, { slots }) {
        return () => h('div', { class: 'grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 items-start py-3' }, [
            h('div', { class: 'min-w-0' }, [
                h('div', { class: 'text-sm font-medium text-default' }, props.label),
                props.description
                    ? h('div', { class: 'text-xs text-accent mt-0.5' }, props.description)
                    : null,
            ]),
            h('div', { class: 'flex items-center gap-1 justify-end min-w-[160px]' }, slots.default?.()),
        ]);
    },
});
