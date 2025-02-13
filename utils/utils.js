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

export function createUtcDateFromIsoString(dateIso) {
  const [year, month, day] = dateIso.split('-');
  const monthIndex = Number(month) - 1;
  const utcTimestamp = Date.UTC(Number(year), monthIndex, Number(day));
  return new Date(utcTimestamp);
}

export function getStartAndEndDates(dateIso, offsetInDays) {
  const date = new Date(dateIso);
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - offsetInDays);
  const startDateISO = startDate.toISOString().split('T')[0];

  const endDate = new Date(date);
  endDate.setDate(date.getDate() + offsetInDays + 1);
  const endDateISO = endDate.toISOString().split('T')[0];

  return [startDateISO, endDateISO];
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
