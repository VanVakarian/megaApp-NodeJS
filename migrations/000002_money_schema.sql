CREATE TABLE IF NOT EXISTS moneyCurrency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    ticker TEXT NOT NULL,
    symbol TEXT NOT NULL,
    symbolPosEnum TEXT NOT NULL CHECK(symbolPosEnum IN ('before', 'after')),
    whitespace BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moneyCategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    parentId INTEGER,
    categoryType TEXT NOT NULL CHECK(categoryType IN ('income', 'expense')),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES moneyCategories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS moneyOrganization (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    logoBase64 TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moneyAccount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    currencyId INTEGER NOT NULL,
    isInvest BOOLEAN NOT NULL DEFAULT 0,
    isArchived BOOLEAN NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    organizationId INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (currencyId) REFERENCES moneyCurrency(id) ON DELETE RESTRICT,
    FOREIGN KEY (organizationId) REFERENCES moneyOrganization(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS moneyAsset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    accountIdsJSON TEXT NOT NULL CHECK(json_valid(accountIdsJSON) = 1 AND json_type(accountIdsJSON) = 'array' AND json_array_length(accountIdsJSON) > 0),
    ticker TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('stock', 'bond', 'crypto')),
    suspendedSince TEXT,
    suspendedUntil TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moneyTransaction (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    dateISO TEXT NOT NULL,
    accountId INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    categoryId INTEGER,
    kind TEXT NOT NULL,
    isGift BOOLEAN NOT NULL DEFAULT 0,
    notes TEXT,
    detailsJSON TEXT,
    twinId INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (accountId) REFERENCES moneyAccount(id) ON DELETE RESTRICT,
    FOREIGN KEY (categoryId) REFERENCES moneyCategories(id) ON DELETE RESTRICT,
    FOREIGN KEY (twinId) REFERENCES moneyTransaction(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moneyRateHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT NOT NULL,
    ratesJson TEXT NOT NULL,
    UNIQUE(dateISO)
);
