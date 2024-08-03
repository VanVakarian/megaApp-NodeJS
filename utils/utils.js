export function isValidISODate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/; // Регулярное выражение для проверки формата YYYY-MM-DD
  if (!regex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString().split('T')[0];
}

export function isValidUnixDate(dateUnix) {
  return !isNaN(new Date(dateUnix * 1000).getTime());
}

export function getStartAndEndUnixDates(dateIso, offsetInDays) {
  const originalDate = new Date(dateIso);
  const startDate = new Date(Date.UTC(originalDate.getUTCFullYear(), originalDate.getUTCMonth(), originalDate.getUTCDate() - offsetInDays)); // prettier-ignore
  const endDate = new Date(Date.UTC(originalDate.getUTCFullYear(), originalDate.getUTCMonth(), originalDate.getUTCDate() + offsetInDays)); // prettier-ignore
  endDate.setUTCHours(23, 59, 59, 999);
  const startDateUnix = Math.floor(startDate.getTime() / 1000);
  const endDateUnix = Math.floor(endDate.getTime() / 1000);
  return [startDateUnix, endDateUnix];
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
