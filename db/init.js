import { DO_RECHECK_DB, INIT_USERS } from '../env.js';
import { getConnection } from './db.js';

async function createTablesIfNotExist(isDevMode = false) {
  const connection = await getConnection();

  if (isDevMode) {
    const tablesToDelete = ['moneyTransaction', 'moneyAsset', 'moneyAccount', 'moneyCurrency', 'moneyCategories'];

    try {
      for (const table of tablesToDelete) {
        await connection.exec(`DROP TABLE IF EXISTS ${table}`);
      }
      console.log('Money tables deleted successfully in debug mode');
    } catch (error) {
      console.error('Error deleting money tables:', error);
    }
  }

  const createTablesQueries = [
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
      invest BOOLEAN DEFAULT 0,
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
      date DATETIME NOT NULL,
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

  try {
    for (const query of createTablesQueries) {
      await connection.exec(query);
    }
    // console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

async function addUserIfNotExists(user) {
  const connection = await getConnection();
  try {
    const checkQuery = 'SELECT COUNT(*) as count FROM users WHERE username = ?';
    const checkResult = await connection.get(checkQuery, [user.username]);

    if (checkResult.count === 0) {
      const insertQuery = 'INSERT INTO users (id, username, hashedPassword, isAdmin) VALUES (?, ?, ?, ?)';
      await connection.run(insertQuery, [user.id, user.username, user.hashedPassword, user.isAdmin]);
      // console.log(`User ${user.username} added.`);
    } else {
      // console.log(`User ${user.username} already exists. Skipping...`);
    }
  } catch (error) {
    console.error(`Failed to add user ${user.username}:`, error);
  }
}

export async function initDatabase() {
  if (DO_RECHECK_DB) {
    await createTablesIfNotExist(true);

    for (const user of INIT_USERS) {
      await addUserIfNotExists(user);
    }
  }
}
