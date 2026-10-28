export const MOODS = ['Calm', 'Happy', 'Grateful', 'Tired', 'Sad', 'Anxious', 'Angry'];

export function showScreen(name) {
  document.body.dataset.screen = name;
  for (const el of document.querySelectorAll('.screen')) {
    el.hidden = el.dataset.screen !== name;
  }
}

export function todayLocalISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatHumanDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function previewText(body, max = 160) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function moodLabel(mood) {
  if (!mood) return '';
  const found = MOODS.find((name) => name.toLowerCase() === String(mood).toLowerCase());
  return found || '';
}

export function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(textarea.scrollHeight, 192)}px`;
}

export function bindPasswordToggles(root = document) {
  for (const btn of root.querySelectorAll('[data-toggle-password]')) {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-password'));
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase');
    });
  }
}

export function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 40);
    });
  });
}

export function newEntryId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
