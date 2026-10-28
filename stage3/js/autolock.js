const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'mousemove',
  'keydown',
  'touchstart',
  'touchmove',
  'wheel',
  'input',
];

export function resolveAutoLockMs(minutes, loc) {
  const hostname = loc && loc.hostname;
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    try {
      const params = new URLSearchParams(loc.search || '');
      if (params.has('autolockms')) {
        const override = Number(params.get('autolockms'));
        if (Number.isFinite(override) && override >= 0) return override;
      }
    } catch {
      // Ignore a malformed query and use the saved minutes.
    }
  }
  const allowed = [1, 5, 15, 30];
  const chosen = allowed.includes(Number(minutes)) ? Number(minutes) : 5;
  return chosen * 60 * 1000;
}

export function createInactivityLock({ getTimeoutMs, onLock }) {
  let timer = null;
  let armed = false;
  let lastActivity = 0;
  let hiddenAt = 0;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (!armed) return;
    const timeout = getTimeoutMs();
    const remaining = Math.max(0, timeout - (Date.now() - lastActivity));
    timer = setTimeout(tick, remaining);
  }

  function tick() {
    if (!armed) return;
    const timeout = getTimeoutMs();
    if (Date.now() - lastActivity >= timeout) {
      armed = false;
      clearTimer();
      onLock();
      return;
    }
    schedule();
  }

  function poke() {
    if (!armed) return;
    lastActivity = Date.now();
    schedule();
  }

  function pageHidden() {
    return document.hidden === true || document.visibilityState === 'hidden';
  }

  function onVisibility() {
    if (!armed) return;
    if (pageHidden()) {
      hiddenAt = Date.now();
      return;
    }
    const timeout = getTimeoutMs();
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away > timeout || Date.now() - lastActivity >= timeout) {
      armed = false;
      clearTimer();
      onLock();
      return;
    }
    schedule();
  }

  function start() {
    armed = true;
    lastActivity = Date.now();
    hiddenAt = 0;
    schedule();
  }

  function stop() {
    armed = false;
    hiddenAt = 0;
    clearTimer();
  }

  for (const name of ACTIVITY_EVENTS) {
    document.addEventListener(name, poke, { capture: true, passive: true });
  }
  document.addEventListener('scroll', poke, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return { start, stop, poke };
}
