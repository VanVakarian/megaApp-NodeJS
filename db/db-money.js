import { getConnection } from './db.js';

// ====================================================================================================== CURRENCIES ===

export async function getAllCurrencies(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, title, ticker, symbol, symbolPosEnum, whitespace
    FROM
      moneyCurrency
    WHERE
      userId = ?
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
      id, title, ticker, symbol, symbolPosEnum, whitespace
    FROM
      moneyCurrency
    WHERE
      id = ? AND userId = ?;
    `,
    [currencyId, userId]
  );
}

export async function createCurrency(title, ticker, symbol, symbolPosEnum, whitespace, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyCurrency (title, ticker, symbol, symbolPosEnum, whitespace, userId)
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
      moneyCurrency
    SET
      title = ?, ticker = ?, symbol = ?, symbolPosEnum = ?, whitespace = ?
    WHERE
      id = ? AND userId = ?;
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
      moneyCurrency
    WHERE
      id = ? AND userId = ?;
    `,
    [currencyId, userId]
  );
  return result.changes;
}

// ====================================================================================================== CATEGORIES ===

export async function getAllCategories(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, name, usedFor, groupKey
    FROM
      moneyCategories
    WHERE
      userId = ? AND parentId IS NULL
    ORDER BY
      usedFor ASC, groupKey ASC, name ASC;
    `,
    [userId]
  );
}

export async function getCategoryById(categoryId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, name, usedFor, groupKey
    FROM
      moneyCategories
    WHERE
      id = ? AND userId = ? AND parentId IS NULL;
    `,
    [categoryId, userId]
  );
}

export async function createCategory(name, usedFor, groupKey, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyCategories (name, usedFor, groupKey, userId, parentId)
    VALUES
      (?, ?, ?, ?, NULL);
    `,
    [name, usedFor, groupKey, userId]
  );
  return result.lastID;
}

export async function updateCategory(categoryId, name, usedFor, groupKey, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyCategories
    SET
      name = ?, usedFor = ?, groupKey = ?
    WHERE
      id = ? AND userId = ? AND parentId IS NULL;
    `,
    [name, usedFor, groupKey, categoryId, userId]
  );
  return result.changes;
}

export async function deleteCategory(categoryId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    DELETE FROM
      moneyCategories
    WHERE
      id = ? AND userId = ? AND parentId IS NULL;
    `,
    [categoryId, userId]
  );
  return result.changes;
}

export async function updateGroupKey(oldGroupKey, newGroupKey, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyCategories
    SET
      groupKey = ?
    WHERE
      groupKey = ? AND userId = ?;
    `,
    [newGroupKey, oldGroupKey, userId]
  );
  return result.changes;
}
