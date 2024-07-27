export function isValidISODate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/; // Регулярное выражение для проверки формата YYYY-MM-DD
  if (!regex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString().split('T')[0];
}

export function transformIsoDateAddDays(dateIsoString, days) {
  const date = new Date(dateIsoString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
