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
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    fiber REAL DEFAULT NULL,
    descriptionForEmbedding TEXT DEFAULT NULL,
    embedding BLOB DEFAULT NULL,
    legacyName TEXT
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

export const dbSchemas = {
  '001': dbVersion001,
  '002': dbVersion002,
  '003': dbVersion003,
};
