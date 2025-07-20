import { INIT_POPULATION_DATA } from '../db-population-data.js';
import {
  DEV_MODE_FORCE_RECREATE_TABLES,
  DEV_MODE_INIT_USERS,
  DEV_MODE_POPULATE_DB,
  DEV_MODE_TABLES_TO_DELETE,
} from '../env.js';
import { getConnection } from './db.js';

const CREATE_TABLES_QUERIES = [
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

export async function initDatabase() {
  if (DEV_MODE_FORCE_RECREATE_TABLES) {
    await dropSpecifiedTables();
  }

  await createTablesIfNotExist();

  for (const user of DEV_MODE_INIT_USERS) {
    await addUserIfNotExists(user);
  }

  if (DEV_MODE_POPULATE_DB) {
    await populateDatabase();
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

async function dropSpecifiedTables() {
  const connection = await getConnection();

  try {
    for (const table of DEV_MODE_TABLES_TO_DELETE) {
      await connection.exec(`DROP TABLE IF EXISTS ${table}`);
    }
    console.log('Money tables deleted successfully in debug mode');
  } catch (error) {
    console.error('Error deleting money tables:', error);
  }
}

async function createTablesIfNotExist() {
  const connection = await getConnection();

  try {
    for (const query of CREATE_TABLES_QUERIES) {
      await connection.exec(query);
    }
    // console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

async function populateDatabase() {
  const connection = await getConnection();

  try {
    for (const [tableName, rows] of Object.entries(INIT_POPULATION_DATA)) {
      for (const row of rows) {
        const columns = Object.keys(row).join(', ');
        const placeholders = Object.keys(row)
          .map(() => '?')
          .join(', ');
        const insertQuery = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
        await connection.run(insertQuery, Object.values(row));
      }
    }
    // console.log('Database populated successfully');
  } catch (error) {
    console.error('Error populating database:', error);
  }
}
