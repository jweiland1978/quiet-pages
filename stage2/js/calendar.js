export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isoFromParts(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, '0');
  const date = String(day).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export function monthTitle(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(year, monthIndex, delta) {
  const next = new Date(year, monthIndex + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

export function dayAriaLabel(year, monthIndex, day, count) {
  const formatted = new Date(year, monthIndex, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const noun = count === 1 ? 'entry' : 'entries';
  return `${formatted}, ${count} ${noun}`;
}

export function countByDate(entries) {
  const counts = new Map();
  for (const entry of entries) {
    if (!entry || !entry.date) continue;
    counts.set(entry.date, (counts.get(entry.date) || 0) + 1);
  }
  return counts;
}

export function buildMonthCells(year, monthIndex, counts) {
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = isoFromParts(year, monthIndex, day);
    const count = counts.get(iso) || 0;
    cells.push({
      iso,
      day,
      count,
      label: dayAriaLabel(year, monthIndex, day, count),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
