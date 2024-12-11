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

export function getStartAndEndDates(dateIso, offsetInDays) {
  const originalDate = new Date(dateIso);

  const startDate = new Date(originalDate);
  startDate.setDate(startDate.getDate() - offsetInDays);
  const startDateISO = startDate.toISOString().split('T')[0];

  const endDate = new Date(originalDate);
  endDate.setDate(endDate.getDate() + offsetInDays + 1);
  const endDateISO = endDate.toISOString().split('T')[0];

  return [startDateISO, endDateISO];
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
