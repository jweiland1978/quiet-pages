import { DB_NAME as EDITION_DB_NAME } from './edition.js?v=3';

export const DB_NAME = EDITION_DB_NAME;
export const DB_VERSION = 1;
export const STORE_META = 'meta';
export const STORE_ENTRIES = 'entries';

let dbPromise;

export function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function withStore(storeName, mode, fn) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      })
  );
}

export function getMeta(key) {
  return withStore(STORE_META, 'readonly', (store) => store.get(key));
}

export function setMeta(key, value) {
  return withStore(STORE_META, 'readwrite', (store) => store.put(value, key));
}

export function deleteMeta(key) {
  return withStore(STORE_META, 'readwrite', (store) => store.delete(key));
}

export async function getSetupMeta() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const saltReq = store.get('salt');
    const iterReq = store.get('iterations');
    const checkReq = store.get('check');
    tx.oncomplete = () =>
      resolve({
        salt: saltReq.result,
        iterations: iterReq.result,
        check: checkReq.result,
      });
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveSetupMeta({ salt, iterations, check }) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put(salt, 'salt');
    store.put(iterations, 'iterations');
    store.put(check, 'check');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getAllEntryRecords() {
  return withStore(STORE_ENTRIES, 'readonly', (store) => store.getAll());
}

export function putEntryRecord(record) {
  return withStore(STORE_ENTRIES, 'readwrite', (store) => store.put(record));
}

export function deleteEntryRecord(id) {
  return withStore(STORE_ENTRIES, 'readwrite', (store) => store.delete(id));
}

export async function isSetup() {
  const { salt, check } = await getSetupMeta();
  return Boolean(salt && check);
}

function finishTx(tx, mapResult) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      try {
        resolve(mapResult ? mapResult() : undefined);
      } catch (err) {
        reject(err);
      }
    };
    tx.onerror = () => reject(tx.error || new Error('transaction error'));
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

export function runTx(storeNames, mode, fn) {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return openDatabase().then((db) => {
    const tx = db.transaction(names, mode);
    const stores = {};
    for (const name of names) stores[name] = tx.objectStore(name);
    let result;
    try {
      result = fn(stores, tx);
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // Already aborted or completed.
      }
      return Promise.reject(err);
    }
    return finishTx(tx, () => result);
  });
}

export function readJournalSnapshot() {
  return openDatabase().then((db) => {
    const tx = db.transaction([STORE_META, STORE_ENTRIES], 'readonly');
    const meta = tx.objectStore(STORE_META);
    const saltReq = meta.get('salt');
    const iterReq = meta.get('iterations');
    const checkReq = meta.get('check');
    const entriesReq = tx.objectStore(STORE_ENTRIES).getAll();
    return finishTx(tx, () => ({
      salt: saltReq.result,
      iterations: iterReq.result,
      check: checkReq.result,
      entries: entriesReq.result || [],
    }));
  });
}

export function commitRekey({ salt, iterations, check, records, draft }) {
  return runTx([STORE_META, STORE_ENTRIES], 'readwrite', (stores) => {
    const meta = stores[STORE_META];
    const entryStore = stores[STORE_ENTRIES];
    meta.put(salt, 'salt');
    meta.put(iterations, 'iterations');
    meta.put(check, 'check');
    for (const record of records) entryStore.put(record);
    if (draft === null) meta.delete('draft');
    else if (draft) meta.put(draft, 'draft');
  });
}

export function putEntryRecords(records) {
  if (!records.length) return Promise.resolve();
  return runTx(STORE_ENTRIES, 'readwrite', (stores) => {
    const entryStore = stores[STORE_ENTRIES];
    for (const record of records) entryStore.put(record);
  });
}

export function replaceEntryRecords(records) {
  return runTx(STORE_ENTRIES, 'readwrite', (stores) => {
    const entryStore = stores[STORE_ENTRIES];
    entryStore.clear();
    for (const record of records) entryStore.put(record);
  });
}
