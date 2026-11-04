import './ipc-web-shim';

// capture originals
const origWarn = console.warn.bind(console)
const origError = console.error.bind(console)

// override warn & error
console.warn = (...args: any[]) => {
    const msg = args.map(String).join(' ')
    if (
        msg.includes('APPIMAGE env is not defined') ||
        msg.includes('NODE_TLS_REJECT_UNAUTHORIZED')
    ) return
    origWarn(...args)
}

console.error = (...args: any[]) => {
    const msg = args.map(String).join(' ')
    if (msg.includes('NODE_TLS_REJECT_UNAUTHORIZED')) return
    origError(...args)
}

import { IPCRouter } from '@45drives/houston-common-lib'
IPCRouter.initRenderer()

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import "@45drives/houston-common-css/src/index.css"; 
import "@45drives/houston-common-ui/style.css"; 
import "./style.css"; 
import AppShell from '../app/AppShell.vue';
import { router } from '../app/routes';
import { enterNextDirective } from '@45drives/houston-common-ui';
import { initializeConnections } from './composables/useConnections';

document.title = `45Flow v${__APP_VERSION__}`;

const app = createApp(AppShell);
const pinia = createPinia();
app.use(router)
app.directive('enter-next', enterNextDirective);
app.use(pinia);
initializeConnections().then(() => {
    app.mount('#app');
    window.electron?.ipcRenderer.send('renderer-ready');
}).catch(() => {
    console.error('[connections] initialization failed');
    const root = document.getElementById('app');
    if (root) root.textContent = 'Unable to initialize secure login storage. Please restart 45Flow and check the client logs.';
});
document.documentElement.classList.add('theme-studio-grad-logo-flow');

const IGNORE = [
    'setup() return property "_" should not start with "$" or "_"',
    'Extraneous non-props attributes'
]

app.config.warnHandler = (msg, instance, trace) => {
    // swallow any warning whose text matches one of the patterns
    if (IGNORE.some(p => msg.includes(p))) return

    // otherwise let it through
    console.warn(`[Vue warn]: ${msg}${trace}`)
}