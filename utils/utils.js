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

export function sumArray(arr) {
  if (arr.length === 0) {
    return 0;
  }
  return arr.reduce((sum, val) => sum + val, 0);
}

const enToRuTransliterationRules = {
  '`': 'ё',
  q: 'й',
  w: 'ц',
  e: 'у',
  r: 'к',
  t: 'е',
  y: 'н',
  u: 'г',
  i: 'ш',
  o: 'щ',
  p: 'з',
  '[': 'х',
  ']': 'ъ',
  a: 'ф',
  s: 'ы',
  d: 'в',
  f: 'а',
  g: 'п',
  h: 'р',
  j: 'о',
  k: 'л',
  l: 'д',
  ';': 'ж',
  "'": 'э',
  z: 'я',
  x: 'ч',
  c: 'с',
  v: 'м',
  b: 'и',
  n: 'т',
  m: 'ь',
  ',': 'б',
  '.': 'ю',
};

export function transliterateEnToRu(text) {
  return text
    .split('')
    .map((char) => enToRuTransliterationRules[char.toLowerCase()] || char)
    .join('');
}

export function addTransliterationToQuery(query) {
  const transliteratedQuery = query.split(' ').map(transliterateEnToRu).join(' ');

  if (transliteratedQuery === query) {
    return query;
  }

  return `${query} ${transliteratedQuery}`;
}
