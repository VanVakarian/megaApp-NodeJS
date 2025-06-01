import { getConnection } from './db.js';

// ====================================================================================================== CURRENCIES ===

export async function getAllCurrencies(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, title, ticker, symbol, symbol_pos_enum as symbolPosEnum, whitespace
    FROM
      money_currency
    WHERE
      user_id = ?
    ORDER BY
      title ASC;
    `,
    [userId]
  );
}

export async function getCurrencyById(currencyId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, title, ticker, symbol, symbol_pos_enum as symbolPosEnum, whitespace
    FROM
      money_currency
    WHERE
      id = ? AND user_id = ?;
    `,
    [currencyId, userId]
  );
}

export async function createCurrency(title, ticker, symbol, symbolPosEnum, whitespace, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      money_currency (title, ticker, symbol, symbol_pos_enum, whitespace, user_id)
    VALUES
      (?, ?, ?, ?, ?, ?);
    `,
    [title, ticker, symbol, symbolPosEnum, whitespace, userId]
  );
  return result.lastID;
}

export async function updateCurrency(currencyId, title, ticker, symbol, symbolPosEnum, whitespace, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      money_currency
    SET
      title = ?, ticker = ?, symbol = ?, symbol_pos_enum = ?, whitespace = ?
    WHERE
      id = ? AND user_id = ?;
    `,
    [title, ticker, symbol, symbolPosEnum, whitespace, currencyId, userId]
  );
  return result.changes;
}

export async function deleteCurrency(currencyId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    DELETE FROM
      money_currency
    WHERE
      id = ? AND user_id = ?;
    `,
    [currencyId, userId]
  );
  return result.changes;
}
