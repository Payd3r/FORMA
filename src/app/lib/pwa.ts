import { registerSW } from 'virtual:pwa-register';
let refresh: ((reloadPage?: boolean) => Promise<void>) | undefined;
let needed = false;
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<() => void>();
export const subscribeUpdate = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const needsUpdate = () => needed;
export async function applyUpdate() { if (refresh) await refresh(true); }
export async function checkUpdate() { await registration?.update(); }
export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  refresh = registerSW({ immediate: true,
    onNeedRefresh() { needed = true; listeners.forEach(fn => fn()); },
    onRegisteredSW(_url, reg) { registration = reg; },
    onRegisterError(error) { console.warn('Aggiornamento app non disponibile', error); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkUpdate().catch(() => {}); });
  setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void checkUpdate().catch(() => {}); }, 60 * 60 * 1000);
}
