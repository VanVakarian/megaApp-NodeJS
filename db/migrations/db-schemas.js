const dbVersion001 = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    hashedPassword TEXT,
    isAdmin BOOLEAN
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER,
    darkTheme BOOLEAN,
    selectedChapterFood BOOLEAN,
    selectedChapterMoney BOOLEAN,
    liteVersion BOOLEAN,
    height INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS foodDiary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    foodCatalogueId INTEGER,
    foodWeight INTEGER,
    history TEXT,
    usersId INTEGER,
    ver INTEGER,
    del BOOLEAN
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS foodCatalogue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    kcals INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS foodSettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    height INTEGER,
    useCoeffs BOOLEAN,
    coefficients TEXT,
    selectedCatalogueIds TEXT,
    usersId INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS foodBodyWeight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    weight NUMERIC,
    usersId INTEGER
  );
  `,
];

const dbVersion002 = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    hashedPassword TEXT,
    isAdmin BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER,
    darkTheme BOOLEAN,
    selectedChapterFood BOOLEAN,
    selectedChapterMoney BOOLEAN,
    liteVersion BOOLEAN,
    height INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodDiary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    foodCatalogueId INTEGER,
    foodWeight INTEGER,
    history TEXT,
    usersId INTEGER,
    ver INTEGER,
    del BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodCatalogue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    kcals INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    height INTEGER,
    useCoeffs BOOLEAN,
    coefficients TEXT,
    selectedCatalogueIds TEXT,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodBodyWeight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    weight NUMERIC,
    usersId INTEGER
  );
  `,

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

const dbVersion003 = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    hashedPassword TEXT,
    isAdmin BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER,
    darkTheme BOOLEAN,
    selectedChapterFood BOOLEAN,
    selectedChapterMoney BOOLEAN,
    liteVersion BOOLEAN,
    height INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodDiary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    foodCatalogueId INTEGER,
    foodWeight INTEGER,
    history TEXT,
    usersId INTEGER,
    ver INTEGER,
    del BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodCatalogue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    kcals INTEGER,
    protein REAL DEFAULT NULL,
    fat REAL DEFAULT NULL,
    carbs REAL DEFAULT NULL,
    fiber REAL DEFAULT NULL,
    description TEXT DEFAULT NULL,
    nameVec BLOB DEFAULT NULL,
    descriptionVec BLOB DEFAULT NULL,
    legacyName TEXT DEFAULT NULL
  );
  `,

  `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_foodCatalogue_name ON foodCatalogue(name);
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    height INTEGER,
    useCoeffs BOOLEAN,
    coefficients TEXT,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodBodyWeight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    weight NUMERIC,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSearchQueryEmbeddings (
    query TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    hitCount INTEGER DEFAULT 1,
    lastUsedAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
  `,

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

const dbVersion004 = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    hashedPassword TEXT,
    isAdmin BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER,
    darkTheme BOOLEAN,
    selectedChapterFood BOOLEAN,
    selectedChapterMoney BOOLEAN,
    liteVersion BOOLEAN,
    height INTEGER,
    sex TEXT DEFAULT NULL,
    birthDate TEXT DEFAULT NULL,
    activityLevel TEXT DEFAULT NULL,
    goal TEXT DEFAULT NULL
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodDiary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    foodCatalogueId INTEGER,
    foodWeight INTEGER,
    history TEXT,
    usersId INTEGER,
    ver INTEGER,
    del BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodCatalogue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    kcals INTEGER,
    protein REAL DEFAULT NULL,
    fat REAL DEFAULT NULL,
    carbs REAL DEFAULT NULL,
    fiber REAL DEFAULT NULL,
    description TEXT DEFAULT NULL,
    nameVec BLOB DEFAULT NULL,
    descriptionVec BLOB DEFAULT NULL,
    legacyName TEXT DEFAULT NULL
  );
  `,

  `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_foodCatalogue_name ON foodCatalogue(name);
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    height INTEGER,
    useCoeffs BOOLEAN,
    coefficients TEXT,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodBodyWeight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    weight NUMERIC,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSearchQueryEmbeddings (
    query TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    hitCount INTEGER DEFAULT 1,
    lastUsedAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
  `,

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

const dbVersion005 = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    hashedPassword TEXT,
    isAdmin BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER,
    darkTheme BOOLEAN,
    selectedChapterFood BOOLEAN,
    selectedChapterMoney BOOLEAN,
    liteVersion BOOLEAN,
    height INTEGER,
    sex TEXT DEFAULT NULL,
    birthDate TEXT DEFAULT NULL,
    activityLevel TEXT DEFAULT NULL,
    goal TEXT DEFAULT NULL
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodDiary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    foodCatalogueId INTEGER,
    foodWeight INTEGER,
    history TEXT,
    usersId INTEGER,
    ver INTEGER,
    del BOOLEAN
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodCatalogue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    kcals INTEGER,
    protein REAL DEFAULT NULL,
    fat REAL DEFAULT NULL,
    carbs REAL DEFAULT NULL,
    fiber REAL DEFAULT NULL,
    description TEXT DEFAULT NULL,
    nameVec BLOB DEFAULT NULL,
    descriptionVec BLOB DEFAULT NULL,
    legacyName TEXT DEFAULT NULL
  );
  `,

  `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_foodCatalogue_name ON foodCatalogue(name);
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    height INTEGER,
    useCoeffs BOOLEAN,
    coefficients TEXT,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodBodyWeight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT,
    weight NUMERIC,
    usersId INTEGER
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS foodSearchQueryEmbeddings (
    query TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    hitCount INTEGER DEFAULT 1,
    lastUsedAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyCategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    parentId INTEGER,
    categoryType TEXT NOT NULL CHECK(categoryType IN ('income', 'expense')),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES moneyCategories(id) ON DELETE RESTRICT
  );
  `,

  `
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
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyAccount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    currencyId INTEGER NOT NULL,
    isInvest BOOLEAN NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (currencyId) REFERENCES moneyCurrency(id) ON DELETE RESTRICT
  );
  `,

  `
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
  `,

  `
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
  `,

  `
  CREATE TABLE IF NOT EXISTS moneyRateHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateISO TEXT NOT NULL,
    ratesJson TEXT NOT NULL,
    UNIQUE(dateISO)
  );
  `,
];

export const dbSchemas = {
  '001': dbVersion001,
  '002': dbVersion002,
  '003': dbVersion003,
  '004': dbVersion004,
  '005': dbVersion005,
};
