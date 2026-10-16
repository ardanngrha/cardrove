import { mount } from 'svelte';
import App from './Workspace.svelte';
import './style.css';
import './install.svelte';
mount(App, { target: document.getElementById('app')! });
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // Installation through the browser menu remains available without a worker.
    });
  });
}
