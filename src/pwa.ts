import { registerSW } from 'virtual:pwa-register';

export function registerPwa(): void {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Prompt-less auto update on next visit; PWA plugin handles the rest.
    },
    onOfflineReady() {
      // Already cached; no UI needed.
    }
  });
}
