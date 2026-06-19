export const migration001to002 = [
  `
  CREATE TABLE IF NOT EXISTS moneyCategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    name TEXT NOT NULL,
    parentId INTEGER,
    usedFor TEXT NOT NULL,
    groupKey TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES moneyCategories(id) ON DELETE SET NULL
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyCurrency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT NOT NULL,
    ticker TEXT NOT NULL,
    symbol TEXT,
    symbolPosEnum TEXT CHECK(symbolPosEnum IN ('before', 'after')),
    whitespace BOOLEAN DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyAccount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT NOT NULL,
    currencyId INTEGER,
    isInvest BOOLEAN DEFAULT 0,
    kind TEXT,
    categoryIds TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (currencyId) REFERENCES moneyCurrency(id) ON DELETE SET NULL
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyAsset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    ticker TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT,
    categoryIds TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyTransaction (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    dateISO TEXT NOT NULL,
    accountId INTEGER,
    amount REAL NOT NULL,
    categoryIds TEXT,
    kind TEXT,
    isGift BOOLEAN DEFAULT 0,
    notes TEXT,
    details TEXT,
    twinTransactionId INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (accountId) REFERENCES moneyAccount(id) ON DELETE SET NULL,
    FOREIGN KEY (twinTransactionId) REFERENCES moneyTransaction(id) ON DELETE SET NULL
  );
  `,
];
