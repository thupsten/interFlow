/**
 * Get YYYY-MM-DD string in local timezone.
 * Use this instead of date.toISOString().split('T')[0] which uses UTC and can shift the date.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
