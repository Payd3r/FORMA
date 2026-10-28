export function formatShortDate(iso?: string) {
  if (!iso) return '';
  const normalizedIso = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const date = new Date(normalizedIso);
  if (Number.isNaN(date.getTime())) return iso;
  return date
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    .replace('.', '')
    .toLowerCase();
}

/** Calendar date in the device timezone, without UTC day shifts. */
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
