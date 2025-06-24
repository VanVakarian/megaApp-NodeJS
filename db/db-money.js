import { getConnection } from './db.js';

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                 ~~~ CURRENCIES ~~~                                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                 ~~~ CATEGORIES ~~~                                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export async function getAllCategories(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, name, usedFor, groupKey
    FROM
      moneyCategories
    WHERE
      userId = ?
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
      id = ? AND userId = ?;
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
      id = ? AND userId = ?;
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
      id = ? AND userId = ?;
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

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                  ~~~ ACCOUNTS ~~~                                                 ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export async function getAllAccounts(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, title, currencyId, isInvest, kind, categoryIds
    FROM
      moneyAccount
    WHERE
      userId = ?
    ORDER BY
      title ASC;
    `,
    [userId]
  );
}

export async function getAccountById(accountId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, title, currencyId, isInvest, kind, categoryIds
    FROM
      moneyAccount
    WHERE
      id = ? AND userId = ?;
    `,
    [accountId, userId]
  );
}

export async function createAccount(title, currencyId, isInvest, kind, categoryIds, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyAccount (title, currencyId, isInvest, kind, categoryIds, userId)
    VALUES
      (?, ?, ?, ?, ?, ?);
    `,
    [title, currencyId, isInvest, kind, categoryIds, userId]
  );
  return result.lastID;
}

export async function updateAccount(accountId, title, currencyId, isInvest, kind, categoryIds, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyAccount
    SET
      title = ?, currencyId = ?, isInvest = ?, kind = ?, categoryIds = ?
    WHERE
      id = ? AND userId = ?;
    `,
    [title, currencyId, isInvest, kind, categoryIds, accountId, userId]
  );
  return result.changes;
}

export async function deleteAccount(accountId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    DELETE FROM
      moneyAccount
    WHERE
      id = ? AND userId = ?;
    `,
    [accountId, userId]
  );
  return result.changes;
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                ~~~ TRANSACTIONS ~~~                                               ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export async function getAllTransactions(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, dateISO, accountId, amount, categoryIds, kind, isGift, notes, details
    FROM
      moneyTransaction
    WHERE
      userId = ?
    ORDER BY
      dateISO DESC;
    `,
    [userId]
  );
}

export async function getTransactionById(transactionId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, dateISO, accountId, amount, categoryIds, kind, isGift, notes, details
    FROM
      moneyTransaction
    WHERE
      id = ? AND userId = ?;
    `,
    [transactionId, userId]
  );
}

export async function createTransaction(dateISO, accountId, amount, categoryIds, kind, isGift, notes, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyTransaction (dateISO, accountId, amount, categoryIds, kind, isGift, notes, details, userId, twinTransactionId)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL);
    `,
    [dateISO, accountId, amount, categoryIds, kind, isGift, notes, userId]
  );
  return result.lastID;
}

export async function updateTransaction(
  transactionId,
  dateISO,
  accountId,
  amount,
  categoryIds,
  kind,
  isGift,
  notes,
  userId
) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyTransaction
    SET
      dateISO = ?, accountId = ?, amount = ?, categoryIds = ?, kind = ?, isGift = ?, notes = ?
    WHERE
      id = ? AND userId = ?;
    `,
    [dateISO, accountId, amount, categoryIds, kind, isGift, notes, transactionId, userId]
  );
  return result.changes;
}

export async function deleteTransaction(transactionId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    DELETE FROM
      moneyTransaction
    WHERE
      id = ? AND userId = ?;
    `,
    [transactionId, userId]
  );
  return result.changes;
}
