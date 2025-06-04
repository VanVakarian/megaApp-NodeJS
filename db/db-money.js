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

// ====================================================================================================== CATEGORIES ===

export async function getAllCategories(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, name, entity_scope as entityScope, group_key as groupKey
    FROM
      money_categories
    WHERE
      user_id = ? AND parent_id IS NULL
    ORDER BY
      entity_scope ASC, group_key ASC, name ASC;
    `,
    [userId]
  );
}

export async function getCategoryById(categoryId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, name, entity_scope as entityScope, group_key as groupKey
    FROM
      money_categories
    WHERE
      id = ? AND user_id = ? AND parent_id IS NULL;
    `,
    [categoryId, userId]
  );
}

export async function createCategory(name, entityScope, groupKey, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      money_categories (name, entity_scope, group_key, user_id, parent_id)
    VALUES
      (?, ?, ?, ?, NULL);
    `,
    [name, entityScope, groupKey, userId]
  );
  return result.lastID;
}

export async function updateCategory(categoryId, name, entityScope, groupKey, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      money_categories
    SET
      name = ?, entity_scope = ?, group_key = ?
    WHERE
      id = ? AND user_id = ? AND parent_id IS NULL;
    `,
    [name, entityScope, groupKey, categoryId, userId]
  );
  return result.changes;
}

export async function deleteCategory(categoryId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    DELETE FROM
      money_categories
    WHERE
      id = ? AND user_id = ? AND parent_id IS NULL;
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
      money_categories
    SET
      group_key = ?
    WHERE
      group_key = ? AND user_id = ?;
    `,
    [newGroupKey, oldGroupKey, userId]
  );
  return result.changes;
}
