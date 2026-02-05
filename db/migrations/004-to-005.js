export const migration004to005 = [
  'DROP TABLE IF EXISTS moneyTransaction;',
  'DROP TABLE IF EXISTS moneyAsset;',
  'DROP TABLE IF EXISTS moneyAccount;',
  'DROP TABLE IF EXISTS moneyCategories;',
  `
  CREATE TABLE moneyCategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    name TEXT NOT NULL,
    parentId INTEGER,
    categoryType TEXT NOT NULL CHECK(categoryType IN ('income', 'expense')),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES moneyCategories(id) ON DELETE SET NULL
  );
  `,
  `
  CREATE TABLE moneyAccount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT NOT NULL,
    currencyId INTEGER,
    isInvest BOOLEAN DEFAULT 0,
    kind TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (currencyId) REFERENCES moneyCurrency(id) ON DELETE SET NULL
  );
  `,
  `
  CREATE TABLE moneyAsset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    ticker TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE moneyTransaction (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    dateISO TEXT NOT NULL,
    accountId INTEGER,
    amount REAL NOT NULL,
    categoryId INTEGER,
    kind TEXT,
    isGift BOOLEAN DEFAULT 0,
    notes TEXT,
    details TEXT,
    twinTransactionId INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (accountId) REFERENCES moneyAccount(id) ON DELETE SET NULL,
    FOREIGN KEY (categoryId) REFERENCES moneyCategories(id) ON DELETE SET NULL,
    FOREIGN KEY (twinTransactionId) REFERENCES moneyTransaction(id) ON DELETE SET NULL
  );
  `,
];
