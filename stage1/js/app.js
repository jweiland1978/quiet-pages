import {
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  deriveKey,
  encryptJson,
  decryptJson,
  encryptCheck,
  verifyCheck,
  randomBytes,
} from './crypto.js?v=1';
import {
  isSetup,
  getSetupMeta,
  saveSetupMeta,
  getAllEntryRecords,
  putEntryRecord,
  deleteEntryRecord,
} from './db.js?v=1';
import {
  MOODS,
  showScreen,
  todayLocalISO,
  formatHumanDate,
  previewText,
  moodLabel,
  autosize,
  bindPasswordToggles,
  waitForPaint,
  newEntryId,
} from './ui.js?v=1';

let cryptoKey = null;
let entries = [];
let editingId = null;
let selectedMood = null;
let busy = false;

const els = {};

function cacheEls() {
  els.setupPass = document.getElementById('setup-pass');
  els.setupConfirm = document.getElementById('setup-confirm');
  els.setupAck = document.getElementById('setup-ack');
  els.setupSubmit = document.getElementById('setup-submit');
  els.setupError = document.getElementById('setup-error');
  els.setupForm = document.getElementById('setup-form');
  els.unlockPass = document.getElementById('unlock-pass');
  els.unlockSubmit = document.getElementById('unlock-submit');
  els.unlockError = document.getElementById('unlock-error');
  els.unlockForm = document.getElementById('unlock-form');
  els.lockBtn = document.getElementById('lock-btn');
  els.newEntry = document.getElementById('new-entry');
  els.entryList = document.getElementById('entry-list');
  els.editorForm = document.getElementById('editor-form');
  els.editorHeading = document.getElementById('editor-heading');
  els.entryDate = document.getElementById('entry-date');
  els.entryTitle = document.getElementById('entry-title');
  els.entryBody = document.getElementById('entry-body');
  els.editorError = document.getElementById('editor-error');
  els.saveEntry = document.getElementById('save-entry');
  els.cancelEntry = document.getElementById('cancel-entry');
  els.deleteEntry = document.getElementById('delete-entry');
  els.deleteDialog = document.getElementById('dialog-delete');
  els.confirmDelete = document.getElementById('confirm-delete');
  els.cancelDelete = document.getElementById('cancel-delete');
  els.moods = document.getElementById('moods');
}

function setStatus(el, message) {
  if (!el) return;
  el.textContent = message || '';
}

function sortEntries(list) {
  list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return list;
}

function wipePlaintext() {
  cryptoKey = null;
  for (const entry of entries) {
    entry.title = '';
    entry.body = '';
    entry.mood = null;
    entry.date = '';
  }
  entries = [];
  editingId = null;
  selectedMood = null;
  if (els.entryList) els.entryList.replaceChildren();
  if (els.entryDate) els.entryDate.value = '';
  if (els.entryTitle) els.entryTitle.value = '';
  if (els.entryBody) {
    els.entryBody.value = '';
    els.entryBody.style.height = '';
  }
  if (els.setupPass) els.setupPass.value = '';
  if (els.setupConfirm) els.setupConfirm.value = '';
  if (els.unlockPass) els.unlockPass.value = '';
  setStatus(els.setupError, '');
  setStatus(els.unlockError, '');
  setStatus(els.editorError, '');
  closeDeleteDialog();
}

async function loadEntries() {
  const records = await getAllEntryRecords();
  const loaded = [];
  for (const record of records) {
    try {
      const payload = await decryptJson(cryptoKey, record.iv, record.ciphertext);
      loaded.push({
        id: record.id,
        updatedAt: record.updatedAt || 0,
        date: payload.date || '',
        title: payload.title || '',
        body: payload.body || '',
        mood: payload.mood || null,
      });
    } catch {
      // Skip records that cannot be decrypted.
    }
  }
  entries = sortEntries(loaded);
}

function renderList() {
  const list = els.entryList;
  list.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = "No entries yet. Start a page when you're ready.";
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'entry-card';
    card.dataset.testid = 'entry-item';
    card.dataset.id = entry.id;

    const dateEl = document.createElement('span');
    dateEl.className = 'card-date';
    dateEl.textContent = formatHumanDate(entry.date);

    const titleEl = document.createElement('span');
    titleEl.className = 'card-title';
    titleEl.textContent = entry.title.trim() || 'Untitled';

    card.append(dateEl, titleEl);

    const mood = moodLabel(entry.mood);
    if (mood) {
      const moodEl = document.createElement('span');
      moodEl.className = 'card-mood';
      moodEl.textContent = mood;
      card.append(moodEl);
    }

    const preview = previewText(entry.body);
    if (preview) {
      const previewEl = document.createElement('span');
      previewEl.className = 'card-preview';
      previewEl.textContent = preview;
      card.append(previewEl);
    }

    card.addEventListener('click', () => openEditor(entry.id));
    list.append(card);
  }
}

function updateSetupButton() {
  const pass = els.setupPass.value;
  const confirm = els.setupConfirm.value;
  const ack = els.setupAck.checked;
  const longEnough = pass.length >= 8;
  const match = pass === confirm;
  els.setupSubmit.disabled = busy || !longEnough || !match || !ack;

  if (!pass && !confirm) {
    setStatus(els.setupError, '');
    return;
  }
  if (pass && !longEnough) {
    setStatus(els.setupError, 'Use at least 8 characters.');
    return;
  }
  if (confirm && !match) {
    setStatus(els.setupError, "Passphrases don't match.");
    return;
  }
  setStatus(els.setupError, '');
}

function renderMoods() {
  els.moods.replaceChildren();
  for (const name of MOODS) {
    const id = `mood-${name.toLowerCase()}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mood';
    btn.id = id;
    btn.dataset.testid = id;
    btn.textContent = name;
    btn.setAttribute('aria-pressed', selectedMood === name.toLowerCase() ? 'true' : 'false');
    btn.addEventListener('click', () => {
      const value = name.toLowerCase();
      selectedMood = selectedMood === value ? null : value;
      renderMoods();
    });
    els.moods.append(btn);
  }
}

function openEditor(id) {
  const existing = id ? entries.find((entry) => entry.id === id) : null;
  editingId = existing ? existing.id : null;
  selectedMood = existing && existing.mood ? String(existing.mood).toLowerCase() : null;
  els.entryDate.value = existing?.date || todayLocalISO();
  els.entryTitle.value = existing?.title || '';
  els.entryBody.value = existing?.body || '';
  els.deleteEntry.hidden = !existing;
  els.editorHeading.textContent = existing ? 'Edit entry' : 'New entry';
  setStatus(els.editorError, '');
  renderMoods();
  showScreen('editor');
  autosize(els.entryBody);
  els.entryTitle.focus();
}

function closeDeleteDialog() {
  if (!els.deleteDialog) return;
  els.deleteDialog.hidden = true;
}

function openDeleteDialog() {
  els.deleteDialog.hidden = false;
  els.cancelDelete.focus();
}

async function handleSetup(event) {
  event.preventDefault();
  if (busy) return;
  updateSetupButton();
  if (els.setupSubmit.disabled) return;

  const passphrase = els.setupPass.value;
  busy = true;
  els.setupSubmit.disabled = true;
  els.setupSubmit.textContent = 'Setting up…';
  setStatus(els.setupError, 'Setting up…');
  await waitForPaint();

  try {
    const salt = randomBytes(SALT_LENGTH);
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
    const check = await encryptCheck(key);
    await saveSetupMeta({
      salt,
      iterations: PBKDF2_ITERATIONS,
      check,
    });
    cryptoKey = key;
    entries = [];
    els.setupPass.value = '';
    els.setupConfirm.value = '';
    setStatus(els.setupError, '');
    renderList();
    showScreen('list');
  } catch {
    setStatus(els.setupError, 'Something went wrong while setting up. Try again.');
  } finally {
    busy = false;
    els.setupSubmit.textContent = 'Create journal';
    updateSetupButton();
  }
}

async function handleUnlock(event) {
  event.preventDefault();
  if (busy) return;
  const passphrase = els.unlockPass.value;
  if (!passphrase) {
    setStatus(els.unlockError, 'Enter your passphrase.');
    els.unlockPass.focus();
    return;
  }

  busy = true;
  els.unlockSubmit.disabled = true;
  els.unlockSubmit.textContent = 'Unlocking…';
  setStatus(els.unlockError, 'Unlocking…');
  await waitForPaint();

  try {
    const meta = await getSetupMeta();
    if (!meta.salt || !meta.check) {
      throw new Error('missing setup');
    }
    const iterations = meta.iterations || PBKDF2_ITERATIONS;
    const key = await deriveKey(passphrase, meta.salt, iterations);
    const ok = await verifyCheck(key, meta.check);
    if (!ok) throw new Error('bad passphrase');
    cryptoKey = key;
    await loadEntries();
    els.unlockPass.value = '';
    setStatus(els.unlockError, '');
    renderList();
    showScreen('list');
  } catch {
    setStatus(els.unlockError, "That passphrase didn't work. Try again.");
    els.unlockPass.value = '';
    els.unlockPass.focus();
  } finally {
    busy = false;
    els.unlockSubmit.disabled = false;
    els.unlockSubmit.textContent = 'Unlock';
  }
}

function handleLock() {
  if (busy) return;
  wipePlaintext();
  showScreen('lock');
  els.unlockPass.focus();
}

async function handleSave(event) {
  event.preventDefault();
  if (busy || !cryptoKey) return;
  const title = els.entryTitle.value.trim();
  const body = els.entryBody.value.trim();
  if (!title && !body) {
    setStatus(els.editorError, 'Write a title or some text before saving.');
    els.entryTitle.focus();
    return;
  }

  const payload = {
    date: els.entryDate.value || todayLocalISO(),
    title: els.entryTitle.value,
    body: els.entryBody.value,
    mood: selectedMood,
  };

  try {
    const { iv, ciphertext } = await encryptJson(cryptoKey, payload);
    const id = editingId || newEntryId();
    const updatedAt = Date.now();
    await putEntryRecord({ id, iv, ciphertext, updatedAt });
    const next = {
      id,
      updatedAt,
      date: payload.date,
      title: payload.title,
      body: payload.body,
      mood: payload.mood,
    };
    const idx = entries.findIndex((entry) => entry.id === id);
    if (idx >= 0) entries[idx] = next;
    else entries.push(next);
    sortEntries(entries);
    editingId = null;
    setStatus(els.editorError, '');
    renderList();
    showScreen('list');
  } catch {
    setStatus(els.editorError, 'Could not save this entry. Try again.');
  }
}

function handleCancel() {
  closeDeleteDialog();
  editingId = null;
  selectedMood = null;
  els.entryDate.value = '';
  els.entryTitle.value = '';
  els.entryBody.value = '';
  setStatus(els.editorError, '');
  showScreen('list');
}

async function handleConfirmDelete() {
  if (!editingId || !cryptoKey) {
    closeDeleteDialog();
    return;
  }
  const id = editingId;
  try {
    await deleteEntryRecord(id);
    entries = entries.filter((entry) => entry.id !== id);
    closeDeleteDialog();
    editingId = null;
    selectedMood = null;
    els.entryDate.value = '';
    els.entryTitle.value = '';
    els.entryBody.value = '';
    renderList();
    showScreen('list');
  } catch {
    closeDeleteDialog();
    setStatus(els.editorError, 'Could not delete this entry. Try again.');
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js?v=1', { scope: './' }).catch(() => {});
}

function bindEvents() {
  els.setupForm.addEventListener('submit', handleSetup);
  els.setupPass.addEventListener('input', updateSetupButton);
  els.setupConfirm.addEventListener('input', updateSetupButton);
  els.setupAck.addEventListener('change', updateSetupButton);
  els.unlockForm.addEventListener('submit', handleUnlock);
  els.lockBtn.addEventListener('click', handleLock);
  els.newEntry.addEventListener('click', () => openEditor(null));
  els.editorForm.addEventListener('submit', handleSave);
  els.cancelEntry.addEventListener('click', handleCancel);
  els.deleteEntry.addEventListener('click', openDeleteDialog);
  els.confirmDelete.addEventListener('click', handleConfirmDelete);
  els.cancelDelete.addEventListener('click', closeDeleteDialog);
  els.deleteDialog.addEventListener('click', (event) => {
    if (event.target === els.deleteDialog) closeDeleteDialog();
  });
  els.entryTitle.addEventListener('input', () => setStatus(els.editorError, ''));
  els.entryBody.addEventListener('input', () => {
    setStatus(els.editorError, '');
    autosize(els.entryBody);
  });
  els.unlockPass.addEventListener('input', () => setStatus(els.unlockError, ''));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.deleteDialog.hidden) {
      event.preventDefault();
      closeDeleteDialog();
    }
  });
  bindPasswordToggles();
}

async function init() {
  cacheEls();
  bindEvents();
  renderMoods();
  updateSetupButton();
  registerServiceWorker();
  try {
    if (await isSetup()) {
      showScreen('lock');
      els.unlockPass.focus();
    } else {
      showScreen('setup');
      els.setupPass.focus();
    }
  } catch {
    showScreen('setup');
    setStatus(els.setupError, 'Could not open local storage. Try another browser.');
  }
}

init();
