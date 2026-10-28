import {
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  deriveKey,
  encryptJson,
  decryptJson,
  encryptCheck,
  verifyCheck,
  randomBytes,
  base64ToBytes,
} from './crypto.js?v=4';
import {
  isSetup,
  getSetupMeta,
  saveSetupMeta,
  getAllEntryRecords,
  putEntryRecord,
  deleteEntryRecord,
  readJournalSnapshot,
  commitRekey,
  putEntryRecords,
  replaceEntryRecords,
  getMeta,
  setMeta,
  deleteMeta,
} from './db.js?v=4';
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
} from './ui.js?v=4';
import { WEEKDAYS, monthTitle, shiftMonth, countByDate, buildMonthCells } from './calendar.js?v=4';
import { filterEntries } from './search.js?v=4';
import {
  shouldShowBackupBanner,
  backupFilename,
  isLoopbackHost,
  buildBackupDocument,
  parseBackupDocument,
  formatImportSummary,
} from './backup.js?v=4';
import { normalizeAutoLock, readSettings, writeAutoLockMinutes, writeLastExportAt, writeDismissedAt } from './settings.js?v=4';
import { createInactivityLock, resolveAutoLockMs } from './autolock.js?v=4';
import { EDITION, DEMO_ENTRY_LIMIT, FULL_VERSION_URL, APP_VERSION } from './edition.js?v=4';

let cryptoKey = null;
let entries = [];
let editingId = null;
let selectedMood = null;
let busy = false;
let epoch = 0;
let viewMode = 'list';
let searchQuery = '';
let selectedDate = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let pendingImport = null;
let editorOpen = false;
let editorBaseline = null;
let locking = false;
let backTarget = 'settings';
let settings = {
  autoLockMinutes: 5,
  lastExportAt: null,
  dismissedAt: null,
};

const els = {};
let autoLock = null;

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
  els.viewList = document.getElementById('view-list');
  els.viewCalendar = document.getElementById('view-calendar');
  els.listView = document.getElementById('list-view');
  els.calendarView = document.getElementById('calendar-view');
  els.searchInput = document.getElementById('search-input');
  els.searchClear = document.getElementById('search-clear');
  els.searchEmpty = document.getElementById('search-empty');
  els.banner = document.getElementById('backup-banner');
  els.bannerDismiss = document.getElementById('backup-banner-dismiss');
  els.bannerOpen = document.getElementById('backup-banner-open');
  els.settingsBtn = document.getElementById('settings-btn');
  els.settingsBack = document.getElementById('settings-back');
  els.autolock = document.getElementById('autolock-select');
  els.exportBackup = document.getElementById('export-backup');
  els.exportStatus = document.getElementById('export-status');
  els.importFile = document.getElementById('import-file');
  els.importPass = document.getElementById('import-pass');
  els.importSubmit = document.getElementById('import-submit');
  els.importError = document.getElementById('import-error');
  els.importStatus = document.getElementById('import-status');
  els.replaceDialog = document.getElementById('dialog-replace');
  els.confirmReplace = document.getElementById('confirm-replace');
  els.cancelReplace = document.getElementById('cancel-replace');
  els.cpForm = document.getElementById('cp-form');
  els.cpCurrent = document.getElementById('cp-current');
  els.cpNew = document.getElementById('cp-new');
  els.cpConfirm = document.getElementById('cp-confirm');
  els.cpStatus = document.getElementById('cp-status');
  els.backupSection = document.getElementById('backup-section');
  els.calPrev = document.getElementById('cal-prev');
  els.calNext = document.getElementById('cal-next');
  els.calToday = document.getElementById('cal-today');
  els.calTitle = document.getElementById('cal-title');
  els.calGrid = document.getElementById('cal-grid');
  els.calDayEntries = document.getElementById('cal-day-entries');
  els.emptyState = document.getElementById('empty-state');
  els.demoBadge = document.getElementById('demo-badge');
  els.demoLimitNote = document.getElementById('demo-limit-note');
  els.getFullLink = document.getElementById('get-full-link');
  els.draftRestored = document.getElementById('draft-restored');
  els.appVersion = document.getElementById('app-version');
  els.helpBtn = document.getElementById('help-btn');
  els.privacyBtn = document.getElementById('privacy-btn');
  els.aboutBtn = document.getElementById('about-btn');
  els.aboutHelp = document.getElementById('about-help');
  els.aboutPrivacy = document.getElementById('about-privacy');
}

function setStatus(el, message) {
  if (!el) return;
  el.textContent = message || '';
}

function setLiveStatus(el, message) {
  if (!el) return;
  const text = message || '';
  el.textContent = text;
  el.hidden = !text;
}

function sortEntries(list) {
  list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return list;
}

function clearSecretField(input) {
  if (!input) return;
  input.value = '';
  input.removeAttribute('value');
}

function closeDeleteDialog() {
  if (!els.deleteDialog) return;
  els.deleteDialog.hidden = true;
}

function closeReplaceDialog() {
  if (!els.replaceDialog) return;
  els.replaceDialog.hidden = true;
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
  searchQuery = '';
  pendingImport = null;
  if (els.entryList) els.entryList.replaceChildren();
  if (els.calDayEntries) els.calDayEntries.replaceChildren();
  if (els.calGrid) els.calGrid.replaceChildren();
  if (els.searchEmpty) els.searchEmpty.hidden = true;
  clearSecretField(els.entryDate);
  clearSecretField(els.entryTitle);
  if (els.entryBody) {
    els.entryBody.value = '';
    els.entryBody.textContent = '';
    els.entryBody.style.height = '';
  }
  clearSecretField(els.setupPass);
  clearSecretField(els.setupConfirm);
  clearSecretField(els.unlockPass);
  clearSecretField(els.searchInput);
  clearSecretField(els.importPass);
  clearSecretField(els.cpCurrent);
  clearSecretField(els.cpNew);
  clearSecretField(els.cpConfirm);
  if (els.importFile) els.importFile.value = '';
  setStatus(els.setupError, '');
  setStatus(els.unlockError, '');
  setStatus(els.editorError, '');
  setStatus(els.cpStatus, '');
  setLiveStatus(els.importError, '');
  setLiveStatus(els.importStatus, '');
  closeDeleteDialog();
  closeReplaceDialog();
  editorOpen = false;
  editorBaseline = null;
  if (els.draftRestored) els.draftRestored.hidden = true;
}

function normalizeDraft(state) {
  const moodRaw = state && state.mood ? String(state.mood).toLowerCase() : '';
  const mood = MOODS.some((name) => name.toLowerCase() === moodRaw) ? moodRaw : null;
  const entryId = state && typeof state.entryId === 'string' && state.entryId ? state.entryId : null;
  return {
    entryId,
    date: state && typeof state.date === 'string' ? state.date : '',
    title: state && typeof state.title === 'string' ? state.title : '',
    body: state && typeof state.body === 'string' ? state.body : '',
    mood,
  };
}

function blankDraft(state) {
  if (!state) return;
  state.title = '';
  state.body = '';
  state.date = '';
  state.mood = null;
}

function readEditorState() {
  return normalizeDraft({
    entryId: editingId,
    date: els.entryDate ? els.entryDate.value : '',
    title: els.entryTitle ? els.entryTitle.value : '',
    body: els.entryBody ? els.entryBody.value : '',
    mood: selectedMood,
  });
}

function sameDraft(a, b) {
  if (!a || !b) return false;
  return a.entryId === b.entryId && a.date === b.date && a.title === b.title && a.body === b.body && a.mood === b.mood;
}

function isEditorDirty() {
  if (!editorOpen || !editorBaseline) return false;
  return !sameDraft(readEditorState(), editorBaseline);
}

async function clearStoredDraft() {
  try {
    await deleteMeta('draft');
  } catch {
    // A failed delete can restore the previous encrypted draft on the next unlock.
  }
}

async function reencryptStoredDraft(oldKey, newKey) {
  if (editorOpen && isEditorDirty()) {
    const payload = readEditorState();
    const record = await encryptJson(newKey, payload);
    blankDraft(payload);
    return record;
  }
  const stored = await getMeta('draft');
  if (!stored || !stored.iv || !stored.ciphertext) return undefined;
  try {
    const plain = await decryptJson(oldKey, stored.iv, stored.ciphertext);
    const record = await encryptJson(newKey, normalizeDraft(plain));
    blankDraft(plain);
    return record;
  } catch {
    return null;
  }
}

function rememberEditorBaseline() {
  editorBaseline = readEditorState();
  editorOpen = true;
}

async function handleLock() {
  if (locking) return;
  locking = true;
  epoch += 1;
  if (autoLock) autoLock.stop();
  try {
    const key = cryptoKey;
    if (key && editorOpen && isEditorDirty()) {
      try {
        const payload = readEditorState();
        const record = await encryptJson(key, payload);
        blankDraft(payload);
        if (cryptoKey === key) await setMeta('draft', record);
      } catch {
        // Still lock. The unsaved page could not be kept.
      }
    }
  } finally {
    busy = false;
    wipePlaintext();
    showScreen('lock');
    if (els.unlockPass) els.unlockPass.focus();
    locking = false;
  }
}

async function loadSettings() {
  try {
    settings = await readSettings();
  } catch {
    settings = { autoLockMinutes: 5, lastExportAt: null, dismissedAt: null };
  }
  if (els.autolock) els.autolock.value = String(settings.autoLockMinutes);
}

async function loadEntries() {
  const records = await getAllEntryRecords();
  const loaded = [];
  for (const record of records) {
    try {
      const payload = await decryptJson(cryptoKey, record.iv, record.ciphertext);
      loaded.push({
        id: record.id,
        updatedAt: record.updatedAt || payload.updatedAt || 0,
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

function visibleEntries() {
  return filterEntries(entries, searchQuery);
}

function createEntryCard(entry) {
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
  return card;
}

function renderList() {
  const list = els.entryList;
  if (!list) return;
  list.replaceChildren();
  const query = searchQuery.trim();
  const shown = visibleEntries();
  if (query && shown.length === 0) {
    if (els.searchEmpty) els.searchEmpty.hidden = false;
    if (els.emptyState) els.emptyState.hidden = true;
    return;
  }
  if (els.searchEmpty) els.searchEmpty.hidden = true;
  if (entries.length === 0) {
    if (els.emptyState) els.emptyState.hidden = false;
    return;
  }
  if (els.emptyState) els.emptyState.hidden = true;
  for (const entry of shown) list.append(createEntryCard(entry));
}

function renderSelectedDay() {
  const box = els.calDayEntries;
  if (!box) return;
  box.replaceChildren();
  if (!selectedDate) return;
  const shown = visibleEntries().filter((entry) => entry.date === selectedDate);
  for (const entry of shown) box.append(createEntryCard(entry));
}

function renderCalendar() {
  if (!els.calGrid || !els.calTitle) return;
  const counts = countByDate(visibleEntries());
  const cells = buildMonthCells(calYear, calMonth, counts);
  els.calTitle.textContent = monthTitle(calYear, calMonth);
  const grid = els.calGrid;
  grid.replaceChildren();
  const today = todayLocalISO();
  for (const name of WEEKDAYS) {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = name;
    grid.append(el);
  }
  for (const cell of cells) {
    if (!cell) {
      const pad = document.createElement('div');
      pad.className = 'cal-pad';
      grid.append(pad);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    if (cell.count > 0) btn.classList.add('has-entries');
    if (cell.iso === today) btn.classList.add('is-today');
    if (cell.iso === selectedDate) btn.classList.add('is-selected');
    btn.dataset.testid = 'cal-day';
    btn.dataset.date = cell.iso;
    btn.dataset.count = String(cell.count);
    btn.setAttribute('aria-label', cell.label);
    btn.setAttribute('aria-pressed', cell.iso === selectedDate ? 'true' : 'false');
    if (cell.iso === today) btn.setAttribute('aria-current', 'date');
    const num = document.createElement('span');
    num.className = 'cal-num';
    num.textContent = String(cell.day);
    btn.append(num);
    if (cell.count > 0) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      dot.setAttribute('aria-hidden', 'true');
      btn.append(dot);
    }
    btn.addEventListener('click', () => {
      selectedDate = cell.iso;
      renderCalendar();
    });
    grid.append(btn);
  }
  renderSelectedDay();
}

function updateDemoNote() {
  if (!els.demoLimitNote) return;
  if (EDITION !== 'demo' || entries.length < DEMO_ENTRY_LIMIT) els.demoLimitNote.hidden = true;
}

function renderAll() {
  renderList();
  renderCalendar();
  updateBanner();
  updateDemoNote();
}

function updateBanner() {
  if (!els.banner) return;
  const show = shouldShowBackupBanner({
    entryCount: entries.length,
    lastExportAt: settings.lastExportAt,
    dismissedAt: settings.dismissedAt,
    now: Date.now(),
  });
  els.banner.hidden = !show;
}

function setView(mode) {
  viewMode = mode === 'calendar' ? 'calendar' : 'list';
  if (els.listView) els.listView.hidden = viewMode !== 'list';
  if (els.calendarView) els.calendarView.hidden = viewMode !== 'calendar';
  if (els.viewList) els.viewList.setAttribute('aria-selected', viewMode === 'list' ? 'true' : 'false');
  if (els.viewCalendar) els.viewCalendar.setAttribute('aria-selected', viewMode === 'calendar' ? 'true' : 'false');
  if (viewMode === 'calendar') renderCalendar();
  else renderList();
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
  els.entryDate.value = existing ? existing.date || todayLocalISO() : selectedDate || todayLocalISO();
  els.entryTitle.value = existing ? existing.title || '' : '';
  els.entryBody.value = existing ? existing.body || '' : '';
  els.deleteEntry.hidden = !existing;
  els.editorHeading.textContent = existing ? 'Edit entry' : 'New entry';
  setStatus(els.editorError, '');
  if (els.draftRestored) els.draftRestored.hidden = true;
  renderMoods();
  rememberEditorBaseline();
  showScreen('editor');
  window.scrollTo(0, 0);
  autosize(els.entryBody);
  els.entryTitle.focus();
}

function applyDraft(state) {
  const draft = normalizeDraft(state);
  const existing = draft.entryId ? entries.find((entry) => entry.id === draft.entryId) : null;
  editingId = draft.entryId;
  selectedMood = draft.mood;
  els.entryDate.value = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : (existing && existing.date) || todayLocalISO();
  els.entryTitle.value = draft.title;
  els.entryBody.value = draft.body;
  els.deleteEntry.hidden = !existing;
  els.editorHeading.textContent = existing ? 'Edit entry' : 'New entry';
  setStatus(els.editorError, '');
  if (els.draftRestored) els.draftRestored.hidden = false;
  renderMoods();
  rememberEditorBaseline();
  renderAll();
  showScreen('editor');
  window.scrollTo(0, 0);
  autosize(els.entryBody);
  if (els.entryTitle) els.entryTitle.focus();
}

async function tryRestoreDraft(key) {
  let record;
  try {
    record = await getMeta('draft');
  } catch {
    return false;
  }
  if (!record || !record.iv || !record.ciphertext) return false;
  let state;
  try {
    state = await decryptJson(key, record.iv, record.ciphertext);
  } catch {
    try {
      await deleteMeta('draft');
    } catch {
      // Leave a corrupt draft rather than throw during unlock.
    }
    return false;
  }
  if (!cryptoKey || cryptoKey !== key) {
    blankDraft(state);
    return false;
  }
  applyDraft(state);
  blankDraft(state);
  return true;
}

function handleNewEntry() {
  if (EDITION === 'demo' && entries.length >= DEMO_ENTRY_LIMIT) {
    if (els.demoLimitNote) els.demoLimitNote.hidden = false;
    return;
  }
  if (els.demoLimitNote) els.demoLimitNote.hidden = true;
  openEditor(null);
}

function openSubScreen(name) {
  backTarget = document.body.dataset.screen || 'settings';
  showScreen(name);
  window.scrollTo(0, 0);
}

function handleScreenBack() {
  const dest = backTarget || 'settings';
  backTarget = 'settings';
  if (dest === 'list' || dest === 'editor' || dest === 'setup' || dest === 'lock') {
    showMain();
    return;
  }
  showScreen(dest);
  window.scrollTo(0, 0);
}

function configureEdition() {
  const demo = EDITION === 'demo';
  if (els.demoBadge) els.demoBadge.hidden = !demo;
  for (const el of document.querySelectorAll('.demo-only')) el.hidden = !demo;
  if (els.getFullLink) {
    const url = String(FULL_VERSION_URL || '').trim();
    if (url) {
      els.getFullLink.href = url;
      els.getFullLink.textContent = 'Get the full version';
    } else {
      els.getFullLink.href = '#get-full-version';
      els.getFullLink.textContent = 'Get the full version — coming soon';
      els.getFullLink.addEventListener('click', (event) => event.preventDefault());
    }
  }
  if (els.appVersion) els.appVersion.textContent = `Version ${APP_VERSION} (${EDITION})`;
}

function dismissSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.style.pointerEvents = 'none';
  splash.classList.add('is-done');
  splash.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (splash.parentNode) splash.remove();
  }, 300);
}

function describeImport(added, updated, skipped, capSkipped) {
  const msg = formatImportSummary({ added, updated, skipped });
  if (!capSkipped) return msg;
  const noun = capSkipped === 1 ? 'entry was' : 'entries were';
  return `${msg} ${capSkipped} ${noun} not imported because the demo keeps up to ${DEMO_ENTRY_LIMIT} entries.`;
}

function blankPlain(plain) {
  plain.title = '';
  plain.body = '';
  plain.date = '';
  plain.mood = null;
}

function capReplacePlains(plains) {
  if (EDITION !== 'demo' || plains.length <= DEMO_ENTRY_LIMIT) return { kept: plains, capSkipped: 0 };
  const ranked = plains.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  const kept = ranked.slice(0, DEMO_ENTRY_LIMIT);
  const keepIds = new Set(kept.map((plain) => plain.id));
  for (const plain of plains) {
    if (!keepIds.has(plain.id)) blankPlain(plain);
  }
  return { kept, capSkipped: plains.length - kept.length };
}

function openDeleteDialog() {
  els.deleteDialog.hidden = false;
  els.cancelDelete.focus();
}

function showMain() {
  renderAll();
  showScreen('list');
  window.scrollTo(0, 0);
}

async function handleSetup(event) {
  event.preventDefault();
  if (busy) return;
  updateSetupButton();
  if (els.setupSubmit.disabled) return;

  const passphrase = els.setupPass.value;
  const token = epoch;
  busy = true;
  els.setupSubmit.disabled = true;
  els.setupSubmit.textContent = 'Setting up…';
  setStatus(els.setupError, 'Setting up…');
  await waitForPaint();

  try {
    const salt = randomBytes(SALT_LENGTH);
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
    if (token !== epoch) return;
    const check = await encryptCheck(key);
    if (token !== epoch) return;
    await saveSetupMeta({
      salt,
      iterations: PBKDF2_ITERATIONS,
      check,
    });
    if (token !== epoch) return;
    cryptoKey = key;
    entries = [];
    settings = { autoLockMinutes: 5, lastExportAt: null, dismissedAt: null };
    if (els.autolock) els.autolock.value = '5';
    clearSecretField(els.setupPass);
    clearSecretField(els.setupConfirm);
    setStatus(els.setupError, '');
    showMain();
    if (autoLock) autoLock.start();
  } catch {
    if (token !== epoch) return;
    setStatus(els.setupError, 'Something went wrong while setting up. Try again.');
  } finally {
    if (token === epoch) {
      busy = false;
      els.setupSubmit.textContent = 'Create journal';
      updateSetupButton();
    }
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

  const token = epoch;
  busy = true;
  els.unlockSubmit.disabled = true;
  els.unlockSubmit.textContent = 'Unlocking…';
  setStatus(els.unlockError, '');
  await waitForPaint();

  try {
    const meta = await getSetupMeta();
    if (token !== epoch) return;
    if (!meta.salt || !meta.check) throw new Error('missing setup');
    const iterations = meta.iterations || PBKDF2_ITERATIONS;
    const key = await deriveKey(passphrase, meta.salt, iterations);
    if (token !== epoch) return;
    const ok = await verifyCheck(key, meta.check);
    if (!ok) throw new Error('bad passphrase');
    cryptoKey = key;
    await loadEntries();
    if (token !== epoch || cryptoKey !== key) return;
    await loadSettings();
    if (token !== epoch || cryptoKey !== key) return;
    clearSecretField(els.unlockPass);
    setStatus(els.unlockError, '');
    const openedDraft = await tryRestoreDraft(key);
    if (token !== epoch || cryptoKey !== key) return;
    if (!openedDraft) showMain();
    if (autoLock) autoLock.start();
  } catch {
    if (token !== epoch) return;
    cryptoKey = null;
    entries = [];
    setStatus(els.unlockError, "That passphrase didn't work. Try again.");
    clearSecretField(els.unlockPass);
    els.unlockPass.focus();
  } finally {
    if (token === epoch) {
      busy = false;
      els.unlockSubmit.disabled = false;
      els.unlockSubmit.textContent = 'Unlock';
    }
  }
}

async function handleSave(event) {
  event.preventDefault();
  if (busy || !cryptoKey) return;
  if (!editingId && EDITION === 'demo' && entries.length >= DEMO_ENTRY_LIMIT) {
    setStatus(els.editorError, `The demo keeps up to ${DEMO_ENTRY_LIMIT} entries.`);
    return;
  }
  const title = els.entryTitle.value.trim();
  const body = els.entryBody.value.trim();
  if (!title && !body) {
    setStatus(els.editorError, 'Write a title or some text before saving.');
    els.entryTitle.focus();
    return;
  }

  const updatedAt = Date.now();
  const payload = {
    date: els.entryDate.value || todayLocalISO(),
    title: els.entryTitle.value,
    body: els.entryBody.value,
    mood: selectedMood,
    updatedAt,
  };
  const key = cryptoKey;
  const token = epoch;

  try {
    const { iv, ciphertext } = await encryptJson(key, payload);
    if (token !== epoch || cryptoKey !== key) return;
    const id = editingId || newEntryId();
    await putEntryRecord({ id, iv, ciphertext, updatedAt });
    if (token !== epoch || cryptoKey !== key) return;
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
    editorOpen = false;
    editorBaseline = null;
    editingId = null;
    setStatus(els.editorError, '');
    await clearStoredDraft();
    if (token !== epoch || cryptoKey !== key) return;
    showMain();
  } catch {
    if (token !== epoch || cryptoKey !== key) return;
    setStatus(els.editorError, 'Could not save this entry. Try again.');
  }
}

async function handleCancel() {
  closeDeleteDialog();
  editorOpen = false;
  editorBaseline = null;
  editingId = null;
  selectedMood = null;
  clearSecretField(els.entryDate);
  clearSecretField(els.entryTitle);
  if (els.entryBody) {
    els.entryBody.value = '';
    els.entryBody.style.height = '';
  }
  setStatus(els.editorError, '');
  if (els.draftRestored) els.draftRestored.hidden = true;
  await clearStoredDraft();
  showMain();
}

async function handleConfirmDelete() {
  if (!editingId || !cryptoKey) {
    closeDeleteDialog();
    return;
  }
  const id = editingId;
  const key = cryptoKey;
  const token = epoch;
  try {
    await deleteEntryRecord(id);
    if (token !== epoch || cryptoKey !== key) return;
    entries = entries.filter((entry) => entry.id !== id);
    closeDeleteDialog();
    editorOpen = false;
    editorBaseline = null;
    editingId = null;
    selectedMood = null;
    clearSecretField(els.entryDate);
    clearSecretField(els.entryTitle);
    if (els.entryBody) els.entryBody.value = '';
    await clearStoredDraft();
    if (token !== epoch || cryptoKey !== key) return;
    showMain();
  } catch {
    if (token !== epoch) return;
    closeDeleteDialog();
    setStatus(els.editorError, 'Could not delete this entry. Try again.');
  }
}

function setCpStatus(message, isError) {
  if (!els.cpStatus) return;
  els.cpStatus.textContent = message || '';
  els.cpStatus.classList.toggle('error', Boolean(isError && message));
}

async function handlePassphraseChange(event) {
  event.preventDefault();
  if (busy || !cryptoKey) return;
  const current = els.cpCurrent.value;
  const next = els.cpNew.value;
  const confirm = els.cpConfirm.value;
  if (!current) {
    setCpStatus('Enter your current passphrase.', true);
    els.cpCurrent.focus();
    return;
  }
  if (next.length < 8) {
    setCpStatus('Use at least 8 characters.', true);
    els.cpNew.focus();
    return;
  }
  if (next !== confirm) {
    setCpStatus("Passphrases don't match.", true);
    els.cpConfirm.focus();
    return;
  }

  const token = epoch;
  const previousKey = cryptoKey;
  busy = true;
  setCpStatus('Checking…', false);
  await waitForPaint();

  try {
    const snapshot = await readJournalSnapshot();
    if (token !== epoch || cryptoKey !== previousKey) return;
    if (!snapshot.salt || !snapshot.check) throw new Error('missing setup');
    const iterations = snapshot.iterations || PBKDF2_ITERATIONS;
    const oldKey = await deriveKey(current, snapshot.salt, iterations);
    if (token !== epoch || cryptoKey !== previousKey) return;
    let ok = false;
    try {
      ok = await verifyCheck(oldKey, snapshot.check);
    } catch {
      ok = false;
    }
    if (!ok) {
      setCpStatus("That passphrase didn't work. Try again.", true);
      return;
    }

    const plains = [];
    for (const record of snapshot.entries) {
      let payload;
      try {
        payload = await decryptJson(oldKey, record.iv, record.ciphertext);
      } catch {
        throw new Error('entry');
      }
      if (token !== epoch || cryptoKey !== previousKey) return;
      const updatedAt = record.updatedAt || payload.updatedAt || 0;
      plains.push({
        id: record.id,
        updatedAt,
        date: payload.date || '',
        title: payload.title || '',
        body: payload.body || '',
        mood: payload.mood || null,
      });
    }

    const salt = randomBytes(SALT_LENGTH);
    const newKey = await deriveKey(next, salt, PBKDF2_ITERATIONS);
    if (token !== epoch || cryptoKey !== previousKey) return;
    const check = await encryptCheck(newKey);
    const records = [];
    for (const plain of plains) {
      const { iv, ciphertext } = await encryptJson(newKey, {
        date: plain.date,
        title: plain.title,
        body: plain.body,
        mood: plain.mood,
        updatedAt: plain.updatedAt,
      });
      records.push({ id: plain.id, iv, ciphertext, updatedAt: plain.updatedAt });
    }
    if (token !== epoch || cryptoKey !== previousKey) return;
    const draft = await reencryptStoredDraft(oldKey, newKey);
    if (token !== epoch || cryptoKey !== previousKey) return;
    await commitRekey({
      salt,
      iterations: PBKDF2_ITERATIONS,
      check,
      records,
      draft,
    });
    if (token !== epoch) return;
    cryptoKey = newKey;
    entries = sortEntries(plains);
    clearSecretField(els.cpCurrent);
    clearSecretField(els.cpNew);
    clearSecretField(els.cpConfirm);
    setCpStatus('Passphrase changed.', false);
    if (autoLock) autoLock.poke();
  } catch (err) {
    if (token !== epoch || !cryptoKey) return;
    if (err && err.message === 'entry') {
      setCpStatus('Could not re-encrypt every entry. The passphrase was not changed.', true);
    } else if (els.cpStatus.textContent.indexOf("didn't work") === -1) {
      setCpStatus('Could not change the passphrase. Try again.', true);
    }
  } finally {
    if (token === epoch) busy = false;
  }
}

async function handleExport() {
  if (busy || !cryptoKey) return;
  const token = epoch;
  const key = cryptoKey;
  busy = true;
  setStatus(els.exportStatus, 'Preparing backup…');
  try {
    const snapshot = await readJournalSnapshot();
    if (token !== epoch || cryptoKey !== key) return;
    if (!snapshot.salt || !snapshot.check) throw new Error('missing setup');
    const exportedAt = Date.now();
    const documentBackup = buildBackupDocument({
      salt: snapshot.salt,
      iterations: snapshot.iterations || PBKDF2_ITERATIONS,
      check: snapshot.check,
      entries: snapshot.entries,
      exportedAt,
    });
    const filename = backupFilename(new Date());
    const file = new File([JSON.stringify(documentBackup)], filename, { type: 'application/json' });
    if (token !== epoch || cryptoKey !== key) return;
    const delivery = await deliverBackup(file, () => {
      settings.lastExportAt = exportedAt;
      updateBanner();
    });
    if (delivery === 'aborted' || token !== epoch || cryptoKey !== key) {
      if (token === epoch && cryptoKey === key && delivery === 'aborted') setStatus(els.exportStatus, '');
      return;
    }
    settings.lastExportAt = exportedAt;
    updateBanner();
    await writeLastExportAt(exportedAt);
    if (token !== epoch || cryptoKey !== key) return;
    setStatus(els.exportStatus, 'Backup exported.');
  } catch {
    if (token !== epoch || cryptoKey !== key) return;
    setStatus(els.exportStatus, 'Could not export a backup. Try again.');
  } finally {
    if (token === epoch) busy = false;
  }
}

function triggerDownload(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function deliverBackup(file, beforeDownload) {
  const loopback = isLoopbackHost(location.hostname);
  if (!loopback && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
    let can = false;
    try {
      can = navigator.canShare({ files: [file] });
    } catch {
      can = false;
    }
    if (can) {
      try {
        await navigator.share({ files: [file], title: 'Quiet Pages backup' });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'aborted';
      }
    }
  }
  if (beforeDownload) beforeDownload();
  triggerDownload(file);
  return 'downloaded';
}

function importMode() {
  const selected = document.querySelector('input[name="import-mode"]:checked');
  return selected && selected.value === 'replace' ? 'replace' : 'merge';
}

async function handleImportSubmit() {
  setLiveStatus(els.importError, '');
  setLiveStatus(els.importStatus, '');
  if (busy || !cryptoKey) return;
  const file = els.importFile && els.importFile.files ? els.importFile.files[0] : null;
  const passphrase = els.importPass ? els.importPass.value : '';
  const mode = importMode();
  if (!file) {
    setLiveStatus(els.importError, "This file isn't a Quiet Pages backup.");
    return;
  }
  let text = '';
  try {
    text = await file.text();
  } catch {
    setLiveStatus(els.importError, "This file isn't a Quiet Pages backup.");
    return;
  }
  const backup = parseBackupDocument(text);
  if (!backup) {
    setLiveStatus(els.importError, "This file isn't a Quiet Pages backup.");
    return;
  }
  if (mode === 'replace') {
    pendingImport = { backup, passphrase };
    if (els.importPass) els.importPass.value = '';
    els.replaceDialog.hidden = false;
    els.cancelReplace.focus();
    return;
  }
  if (els.importPass) els.importPass.value = '';
  await runImport({ backup, passphrase, mode: 'merge' });
}

function handleCancelReplace() {
  pendingImport = null;
  closeReplaceDialog();
  setLiveStatus(els.importError, '');
  setLiveStatus(els.importStatus, 'Import cancelled.');
}

async function handleConfirmReplace() {
  const pending = pendingImport;
  pendingImport = null;
  closeReplaceDialog();
  if (!pending || !cryptoKey) return;
  await runImport({ backup: pending.backup, passphrase: pending.passphrase, mode: 'replace' });
}

async function openBackupEntries(backup, passphrase) {
  let salt;
  let iv;
  let ciphertext;
  try {
    salt = base64ToBytes(backup.kdf.salt);
    iv = base64ToBytes(backup.check.iv);
    ciphertext = base64ToBytes(backup.check.ciphertext);
  } catch {
    return { error: 'file' };
  }
  let backupKey;
  try {
    backupKey = await deriveKey(passphrase, salt, backup.kdf.iterations);
  } catch {
    return { error: 'pass' };
  }
  let ok = false;
  try {
    ok = await verifyCheck(backupKey, { iv, ciphertext });
  } catch {
    ok = false;
  }
  if (!ok) return { error: 'pass' };
  const plains = [];
  for (const entry of backup.entries) {
    let entryIv;
    let entryCipher;
    try {
      entryIv = base64ToBytes(entry.iv);
      entryCipher = base64ToBytes(entry.ciphertext);
    } catch {
      return { error: 'file' };
    }
    let payload;
    try {
      payload = await decryptJson(backupKey, entryIv, entryCipher);
    } catch {
      return { error: 'file' };
    }
    plains.push({
      id: entry.id,
      updatedAt: entry.updatedAt || payload.updatedAt || 0,
      date: payload.date || '',
      title: payload.title || '',
      body: payload.body || '',
      mood: payload.mood || null,
    });
  }
  return { plains };
}

async function reencryptPlains(plains, key) {
  const records = [];
  for (const plain of plains) {
    const updatedAt = plain.updatedAt || 0;
    const { iv, ciphertext } = await encryptJson(key, {
      date: plain.date,
      title: plain.title,
      body: plain.body,
      mood: plain.mood,
      updatedAt,
    });
    records.push({ id: plain.id, iv, ciphertext, updatedAt });
    plain.title = '';
    plain.body = '';
    plain.mood = null;
    plain.date = '';
  }
  return records;
}

async function runImport({ backup, passphrase, mode }) {
  if (busy || !cryptoKey) return;
  const token = epoch;
  const key = cryptoKey;
  busy = true;
  setLiveStatus(els.importError, '');
  setLiveStatus(els.importStatus, '');
  try {
    const opened = await openBackupEntries(backup, passphrase);
    passphrase = '';
    if (token !== epoch || cryptoKey !== key) return;
    if (opened.error === 'pass') {
      setLiveStatus(els.importError, "That passphrase didn't work for this backup.");
      return;
    }
    if (opened.error || !opened.plains) {
      setLiveStatus(els.importError, "This file isn't a Quiet Pages backup.");
      return;
    }
    const plains = opened.plains;
    if (mode === 'replace') {
      const capped = capReplacePlains(plains);
      const records = await reencryptPlains(capped.kept, key);
      if (token !== epoch || cryptoKey !== key) return;
      await replaceEntryRecords(records);
      if (token !== epoch || cryptoKey !== key) return;
      await loadEntries();
      if (token !== epoch || cryptoKey !== key) return;
      renderAll();
      setLiveStatus(els.importStatus, describeImport(records.length, 0, capped.capSkipped, capped.capSkipped));
      return;
    }

    const localRecords = await getAllEntryRecords();
    if (token !== epoch || cryptoKey !== key) return;
    const localById = new Map(localRecords.map((record) => [record.id, record]));
    const toWrite = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let capSkipped = 0;
    const room = EDITION === 'demo' ? Math.max(0, DEMO_ENTRY_LIMIT - entries.length) : Infinity;
    for (const plain of plains) {
      const local = localById.get(plain.id);
      if (!local) {
        if (added >= room) {
          capSkipped += 1;
          skipped += 1;
          blankPlain(plain);
          continue;
        }
        toWrite.push(plain);
        added += 1;
      } else if ((plain.updatedAt || 0) > (local.updatedAt || 0)) {
        toWrite.push(plain);
        updated += 1;
      } else {
        skipped += 1;
        plain.title = '';
        plain.body = '';
      }
    }
    const records = await reencryptPlains(toWrite, key);
    if (token !== epoch || cryptoKey !== key) return;
    await putEntryRecords(records);
    if (token !== epoch || cryptoKey !== key) return;
    await loadEntries();
    if (token !== epoch || cryptoKey !== key) return;
    renderAll();
    setLiveStatus(els.importStatus, describeImport(added, updated, skipped, capSkipped));
  } catch {
    if (token !== epoch || cryptoKey !== key) return;
    setLiveStatus(els.importError, "This file isn't a Quiet Pages backup.");
  } finally {
    passphrase = '';
    if (token === epoch) busy = false;
  }
}

async function handleDismissBanner() {
  const now = Date.now();
  settings.dismissedAt = now;
  updateBanner();
  try {
    await writeDismissedAt(now);
  } catch {
    // The in-memory dismissal still hides the banner for this session.
  }
}

function openSettings(scrollToBackup) {
  if (els.autolock) els.autolock.value = String(normalizeAutoLock(settings.autoLockMinutes));
  showScreen('settings');
  window.scrollTo(0, 0);
  if (scrollToBackup && els.backupSection) {
    els.backupSection.scrollIntoView({ block: 'start' });
  }
}

async function handleAutoLockChange() {
  const minutes = normalizeAutoLock(els.autolock.value);
  settings.autoLockMinutes = minutes;
  els.autolock.value = String(minutes);
  try {
    await writeAutoLockMinutes(minutes);
  } catch {
    // Keep the choice in memory; the timer still uses it.
  }
  if (autoLock) autoLock.poke();
}

function shiftCalendar(delta) {
  const next = shiftMonth(calYear, calMonth, delta);
  calYear = next.year;
  calMonth = next.month;
  renderCalendar();
}

function jumpToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js?v=4', { scope: './' }).catch(() => {});
}

function bindEvents() {
  els.setupForm.addEventListener('submit', handleSetup);
  els.setupPass.addEventListener('input', updateSetupButton);
  els.setupConfirm.addEventListener('input', updateSetupButton);
  els.setupAck.addEventListener('change', updateSetupButton);
  els.unlockForm.addEventListener('submit', handleUnlock);
  for (const btn of document.querySelectorAll('[data-testid="lock-btn"]')) {
    btn.addEventListener('click', () => {
      handleLock();
    });
  }
  els.newEntry.addEventListener('click', handleNewEntry);
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
  els.viewList.addEventListener('click', () => setView('list'));
  els.viewCalendar.addEventListener('click', () => setView('calendar'));
  els.searchInput.addEventListener('input', () => {
    searchQuery = els.searchInput.value;
    renderAll();
  });
  els.searchClear.addEventListener('click', () => {
    searchQuery = '';
    clearSecretField(els.searchInput);
    renderAll();
    els.searchInput.focus();
  });
  els.calPrev.addEventListener('click', () => shiftCalendar(-1));
  els.calNext.addEventListener('click', () => shiftCalendar(1));
  els.calToday.addEventListener('click', jumpToday);
  els.settingsBtn.addEventListener('click', () => openSettings(false));
  els.settingsBack.addEventListener('click', () => showMain());
  els.bannerDismiss.addEventListener('click', handleDismissBanner);
  els.bannerOpen.addEventListener('click', () => openSettings(true));
  els.autolock.addEventListener('change', handleAutoLockChange);
  els.exportBackup.addEventListener('click', handleExport);
  els.importSubmit.addEventListener('click', handleImportSubmit);
  els.importFile.addEventListener('change', () => {
    setLiveStatus(els.importError, '');
    setLiveStatus(els.importStatus, '');
  });
  els.confirmReplace.addEventListener('click', handleConfirmReplace);
  els.cancelReplace.addEventListener('click', handleCancelReplace);
  els.replaceDialog.addEventListener('click', (event) => {
    if (event.target === els.replaceDialog) handleCancelReplace();
  });
  els.cpForm.addEventListener('submit', handlePassphraseChange);
  if (els.helpBtn) els.helpBtn.addEventListener('click', () => openSubScreen('help'));
  if (els.privacyBtn) els.privacyBtn.addEventListener('click', () => openSubScreen('privacy'));
  if (els.aboutBtn) els.aboutBtn.addEventListener('click', () => openSubScreen('about'));
  if (els.aboutHelp) els.aboutHelp.addEventListener('click', () => openSubScreen('help'));
  if (els.aboutPrivacy) els.aboutPrivacy.addEventListener('click', () => openSubScreen('privacy'));
  for (const btn of document.querySelectorAll('[data-testid="screen-back"]')) {
    btn.addEventListener('click', handleScreenBack);
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (els.deleteDialog && !els.deleteDialog.hidden) {
      event.preventDefault();
      closeDeleteDialog();
    } else if (els.replaceDialog && !els.replaceDialog.hidden) {
      event.preventDefault();
      handleCancelReplace();
    }
  });
  bindPasswordToggles();
}

async function init() {
  cacheEls();
  configureEdition();
  autoLock = createInactivityLock({
    getTimeoutMs: () => resolveAutoLockMs(settings.autoLockMinutes, window.location),
    onLock: () => {
      handleLock();
    },
  });
  bindEvents();
  renderMoods();
  setView('list');
  updateSetupButton();
  registerServiceWorker();
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
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
  } finally {
    dismissSplash();
  }
}

init();
