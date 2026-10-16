interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const display = matchMedia('(display-mode: standalone)');
export const installation = $state({
  installed: display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
  available: false,
  busy: false,
  error: false,
});
let pending: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  pending = event as InstallEvent;
  installation.available = true;
});
window.addEventListener('appinstalled', () => {
  pending = null;
  installation.installed = true;
  installation.available = false;
});
display.addEventListener('change', () => {
  installation.installed = display.matches;
});
export async function installApp() {
  if (!pending || installation.busy) return;
  installation.busy = true;
  installation.error = false;
  const event = pending;
  pending = null;
  installation.available = false;
  try {
    await event.prompt();
    await event.userChoice;
  } catch {
    installation.error = true;
  } finally {
    installation.busy = false;
  }
}
