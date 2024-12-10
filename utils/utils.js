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

export function getStartAndEndUnixDates(dateIso, offsetInDays, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const originalDate = new Date(dateIso);

  // Вычисляем общее смещение
  const totalOffset = -userTZOffsetHours + userPreferredMidnightOffsetHours;

  // Устанавливаем начальную дату
  const startDate = new Date(
    Date.UTC(originalDate.getUTCFullYear(), originalDate.getUTCMonth(), originalDate.getUTCDate() - offsetInDays)
  );
  // Применяем общее смещение
  startDate.setUTCHours(startDate.getUTCHours() + totalOffset, 0, 0, 0);

  // Устанавливаем конечную дату
  const endDate = new Date(
    Date.UTC(originalDate.getUTCFullYear(), originalDate.getUTCMonth(), originalDate.getUTCDate() + offsetInDays + 1)
  );
  // Применяем то же самое общее смещение
  endDate.setUTCHours(endDate.getUTCHours() + totalOffset, 0, 0, 0);

  const startDateUnix = Math.floor(startDate.getTime() / 1000);
  const endDateUnix = Math.floor(endDate.getTime() / 1000);

  return [startDateUnix, endDateUnix];
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
