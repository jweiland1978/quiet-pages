import { bytesToBase64 } from './crypto.js?v=5';

const REMINDER_MS = 14 * 24 * 60 * 60 * 1000;

export function shouldShowBackupBanner({ entryCount, lastExportAt, dismissedAt, now }) {
  const count = Number(entryCount) || 0;
  if (count < 1) return false;
  const t = Number(now);
  if (!Number.isFinite(t)) return false;
  if (dismissedAt != null && dismissedAt !== '') {
    const dismissed = Number(dismissedAt);
    if (Number.isFinite(dismissed) && t - dismissed < REMINDER_MS) return false;
  }
  if (lastExportAt == null || lastExportAt === '') return true;
  const exported = Number(lastExportAt);
  if (!Number.isFinite(exported)) return true;
  return t - exported > REMINDER_MS;
}

export function backupFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `quiet-pages-backup-${year}-${month}-${day}.qpbackup`;
}

export function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function buildBackupDocument({ salt, iterations, check, entries, exportedAt }) {
  return {
    format: 'quiet-pages-backup',
    version: 1,
    exportedAt,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToBase64(salt),
    },
    check: {
      iv: bytesToBase64(check.iv),
      ciphertext: bytesToBase64(check.ciphertext),
    },
    entries: (entries || []).map((entry) => ({
      id: entry.id,
      iv: bytesToBase64(entry.iv),
      ciphertext: bytesToBase64(entry.ciphertext),
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    })),
  };
}

export function parseBackupDocument(value) {
  let data = value;
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  if (data.format !== 'quiet-pages-backup') return null;
  if (Number(data.version) !== 1) return null;
  const kdf = data.kdf;
  if (!kdf || typeof kdf !== 'object' || typeof kdf.salt !== 'string' || !kdf.salt) return null;
  const iterations = Number(kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  const check = data.check;
  if (!check || typeof check.iv !== 'string' || !check.iv) return null;
  if (typeof check.ciphertext !== 'string' || !check.ciphertext) return null;
  if (!Array.isArray(data.entries)) return null;
  const entries = [];
  for (const entry of data.entries) {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.id !== 'string' || !entry.id) return null;
    if (typeof entry.iv !== 'string' || !entry.iv) return null;
    if (typeof entry.ciphertext !== 'string' || !entry.ciphertext) return null;
    let updatedAt = 0;
    if (entry.updatedAt != null && entry.updatedAt !== '') {
      updatedAt = Number(entry.updatedAt);
      if (!Number.isFinite(updatedAt)) return null;
    }
    entries.push({
      id: entry.id,
      iv: entry.iv,
      ciphertext: entry.ciphertext,
      updatedAt,
    });
  }
  return {
    format: 'quiet-pages-backup',
    version: 1,
    exportedAt: typeof data.exportedAt === 'number' ? data.exportedAt : null,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: kdf.salt,
    },
    check: { iv: check.iv, ciphertext: check.ciphertext },
    entries,
  };
}

export function formatImportSummary({ added, updated, skipped }) {
  const imported = added + updated;
  return `Imported ${imported} entries (${updated} updated, ${skipped} skipped).`;
}
