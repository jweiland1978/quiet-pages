export function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase();
}

export function entryMatches(entry, query) {
  const needle = normalizeQuery(query);
  if (!needle) return true;
  const title = String(entry && entry.title ? entry.title : '').toLowerCase();
  const body = String(entry && entry.body ? entry.body : '').toLowerCase();
  const mood = String(entry && entry.mood ? entry.mood : '').toLowerCase();
  return title.includes(needle) || body.includes(needle) || mood.includes(needle);
}

export function filterEntries(entries, query) {
  const needle = normalizeQuery(query);
  if (!needle) return entries.slice();
  return entries.filter((entry) => entryMatches(entry, needle));
}
