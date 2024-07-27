export function makeRandomId(len) {
  /**
   * Possible combinations:
   * 62^2 =               3 844
   * 62^3 =             238 328
   * 62^4 =          14 776 336
   * 62^5 =         916 132 832
   * 62^6 =      56 800 235 584
   * 62^7 =   3 521 614 606 208
   * 62^8 = 218 340 105 584 896
   */
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
  // return Array(len).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join(''); // prettier-ignore
}

export async function generateUniqueId(idLen, connection, tableName) {
  let id;
  let isUnique = false;

  while (!isUnique) {
    id = makeRandomId(idLen);
    const query = `SELECT 1 FROM ${tableName} WHERE id = ? LIMIT 1`;
    const res = await connection.get(query, [id]);
    isUnique = !res;
  }

  return id;
}
