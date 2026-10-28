import { getMeta, setMeta } from './db.js?v=4';

export const AUTOLOCK_CHOICES = [1, 5, 15, 30];
export const DEFAULT_AUTOLOCK_MINUTES = 5;

export function normalizeAutoLock(value) {
  const minutes = Number(value);
  return AUTOLOCK_CHOICES.includes(minutes) ? minutes : DEFAULT_AUTOLOCK_MINUTES;
}

export async function readSettings() {
  const [autoLockMinutes, lastExportAt, dismissedAt] = await Promise.all([
    getMeta('autoLockMinutes'),
    getMeta('lastExportAt'),
    getMeta('dismissedAt'),
  ]);
  return {
    autoLockMinutes: normalizeAutoLock(autoLockMinutes),
    lastExportAt: typeof lastExportAt === 'number' ? lastExportAt : null,
    dismissedAt: typeof dismissedAt === 'number' ? dismissedAt : null,
  };
}

export function writeAutoLockMinutes(minutes) {
  return setMeta('autoLockMinutes', normalizeAutoLock(minutes));
}

export function writeLastExportAt(timestamp) {
  return setMeta('lastExportAt', timestamp);
}

export function writeDismissedAt(timestamp) {
  return setMeta('dismissedAt', timestamp);
}
