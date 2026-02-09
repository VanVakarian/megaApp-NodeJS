import { getConnection } from './db.js';

//                                                            ~~~ CURRENCIES ~~~

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
    [userId],
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
    [currencyId, userId],
  );
}

export async function countAccountsByCurrency(currencyId, userId) {
  const db = await getConnection();
  const result = await db.get(
    `
    SELECT
      COUNT(*) as count
    FROM
      moneyAccount
    WHERE
      currencyId = ? AND userId = ?;
    `,
    [currencyId, userId],
  );
  return result?.count ?? 0;
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
    [title, ticker, symbol, symbolPosEnum, whitespace, userId],
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
    [title, ticker, symbol, symbolPosEnum, whitespace, currencyId, userId],
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
    [currencyId, userId],
  );
  return result.changes;
}

//                                                            ~~~ CATEGORIES ~~~

export async function getAllCategories(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, name, parentId, categoryType
    FROM
      moneyCategories
    WHERE
      userId = ?
    ORDER BY
      categoryType ASC, parentId ASC, name ASC;
    `,
    [userId],
  );
}

export async function getCategoryById(categoryId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, name, parentId, categoryType
    FROM
      moneyCategories
    WHERE
      id = ? AND userId = ?;
    `,
    [categoryId, userId],
  );
}

export async function countChildCategories(categoryId, userId) {
  const db = await getConnection();
  const result = await db.get(
    `
    SELECT
      COUNT(*) as count
    FROM
      moneyCategories
    WHERE
      parentId = ? AND userId = ?;
    `,
    [categoryId, userId],
  );
  return result?.count ?? 0;
}

export async function createCategory(name, categoryType, parentId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyCategories (name, categoryType, userId, parentId)
    VALUES
      (?, ?, ?, ?);
    `,
    [name, categoryType, userId, parentId],
  );
  return result.lastID;
}

export async function updateCategory(categoryId, name, categoryType, parentId, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyCategories
    SET
      name = ?, categoryType = ?, parentId = ?
    WHERE
      id = ? AND userId = ?;
    `,
    [name, categoryType, parentId, categoryId, userId],
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
    [categoryId, userId],
  );
  return result.changes;
}

//                                                              ~~~ ACCOUNTS ~~~

export async function getAllAccounts(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, title, currencyId, isInvest, kind
    FROM
      moneyAccount
    WHERE
      userId = ?
    ORDER BY
      title ASC;
    `,
    [userId],
  );
}

export async function getAccountById(accountId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, title, currencyId, isInvest, kind
    FROM
      moneyAccount
    WHERE
      id = ? AND userId = ?;
    `,
    [accountId, userId],
  );
}

export async function countTransactionsByAccount(accountId, userId) {
  const db = await getConnection();
  const result = await db.get(
    `
    SELECT
      COUNT(*) as count
    FROM
      moneyTransaction
    WHERE
      accountId = ? AND userId = ?;
    `,
    [accountId, userId],
  );
  return result?.count ?? 0;
}

export async function createAccount(title, currencyId, isInvest, kind, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyAccount (title, currencyId, isInvest, kind, userId)
    VALUES
      (?, ?, ?, ?, ?);
    `,
    [title, currencyId, isInvest, kind, userId],
  );
  return result.lastID;
}

export async function updateAccount(accountId, title, currencyId, isInvest, kind, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyAccount
    SET
      title = ?, currencyId = ?, isInvest = ?, kind = ?
    WHERE
      id = ? AND userId = ?;
    `,
    [title, currencyId, isInvest, kind, accountId, userId],
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
    [accountId, userId],
  );
  return result.changes;
}

//                                                          ~~~ TRANSACTIONS ~~~

export async function getAllTransactions(userId) {
  const db = await getConnection();
  return await db.all(
    `
    SELECT
      id, dateISO, accountId, amount, categoryId, kind, isGift, notes, details, twinId
    FROM
      moneyTransaction
    WHERE
      userId = ?
    ORDER BY
      dateISO DESC, id DESC;
    `,
    [userId],
  );
}

export async function getTransactionById(transactionId, userId) {
  const db = await getConnection();
  return await db.get(
    `
    SELECT
      id, dateISO, accountId, amount, categoryId, kind, isGift, notes, details, twinId
    FROM
      moneyTransaction
    WHERE
      id = ? AND userId = ?;
    `,
    [transactionId, userId],
  );
}

export async function countTransactionsByCategory(categoryId, userId) {
  const db = await getConnection();
  const result = await db.get(
    `
    SELECT
      COUNT(*) as count
    FROM
      moneyTransaction
    WHERE
      categoryId = ? AND userId = ?;
    `,
    [categoryId, userId],
  );
  return result?.count ?? 0;
}

export async function createTransaction(dateISO, accountId, amount, categoryId, kind, isGift, notes, userId) {
  const db = await getConnection();
  const result = await db.run(
    `
    INSERT INTO
      moneyTransaction (dateISO, accountId, amount, categoryId, kind, isGift, notes, details, userId, twinId)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL);
    `,
    [dateISO, accountId, amount, categoryId, kind, isGift, notes, userId],
  );
  return result.lastID;
}

export async function createTransferTransactions(
  dateISO,
  fromAccountId,
  fromAmount,
  toAccountId,
  toAmount,
  notes,
  userId,
) {
  const db = await getConnection();
  await db.exec('BEGIN');

  try {
    const fromDetails = JSON.stringify({ direction: 'out' });
    const toDetails = JSON.stringify({ direction: 'in' });

    const fromResult = await db.run(
      `
      INSERT INTO
        moneyTransaction (dateISO, accountId, amount, categoryId, kind, isGift, notes, details, userId, twinId)
      VALUES
        (?, ?, ?, NULL, 'transfer', 0, ?, ?, ?, NULL);
      `,
      [dateISO, fromAccountId, fromAmount, notes, fromDetails, userId],
    );

    const fromId = fromResult.lastID;

    const toResult = await db.run(
      `
      INSERT INTO
        moneyTransaction (dateISO, accountId, amount, categoryId, kind, isGift, notes, details, userId, twinId)
      VALUES
        (?, ?, ?, NULL, 'transfer', 0, ?, ?, ?, ?);
      `,
      [dateISO, toAccountId, toAmount, notes, toDetails, userId, fromId],
    );

    const toId = toResult.lastID;

    await db.run(
      `
      UPDATE
        moneyTransaction
      SET
        twinId = ?
      WHERE
        id = ? AND userId = ?;
      `,
      [toId, fromId, userId],
    );

    await db.exec('COMMIT');

    return { fromId, toId };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function updateTransaction(
  transactionId,
  dateISO,
  accountId,
  amount,
  categoryId,
  kind,
  isGift,
  notes,
  userId,
) {
  const db = await getConnection();
  const result = await db.run(
    `
    UPDATE
      moneyTransaction
    SET
      dateISO = ?, accountId = ?, amount = ?, categoryId = ?, kind = ?, isGift = ?, notes = ?
    WHERE
      id = ? AND userId = ?;
    `,
    [dateISO, accountId, amount, categoryId, kind, isGift, notes, transactionId, userId],
  );
  return result.changes;
}

export async function updateTransferTransactions(fromId, toId, dateISO, fromAmount, toAmount, notes, userId) {
  const db = await getConnection();
  await db.exec('BEGIN');

  try {
    const fromResult = await db.run(
      `
      UPDATE
        moneyTransaction
      SET
        dateISO = ?, amount = ?, notes = ?
      WHERE
        id = ? AND userId = ?;
      `,
      [dateISO, fromAmount, notes, fromId, userId],
    );

    const toResult = await db.run(
      `
      UPDATE
        moneyTransaction
      SET
        dateISO = ?, amount = ?, notes = ?
      WHERE
        id = ? AND userId = ?;
      `,
      [dateISO, toAmount, notes, toId, userId],
    );

    await db.exec('COMMIT');

    return fromResult.changes + toResult.changes;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
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
    [transactionId, userId],
  );
  return result.changes;
}
