import { DO_RECHECK_DB, INIT_USERS } from '../env.js';
import { getConnection } from './db.js';

async function createTablesIfNotExist(isDevMode = false) {
  const connection = await getConnection();

  if (isDevMode) {
    const tablesToDelete = ['money_transaction', 'money_asset', 'money_account', 'money_currency', 'money_categories'];

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
    CREATE TABLE IF NOT EXISTS money_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      parent_id INTEGER,
      entity_scope TEXT NOT NULL,
      group_key TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES money_categories(id) ON DELETE SET NULL
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS money_currency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      ticker TEXT NOT NULL,
      symbol TEXT,
      symbol_pos_enum TEXT CHECK(symbol_pos_enum IN ('before', 'after')),
      whitespace BOOLEAN DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS money_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      currency_id INTEGER,
      invest BOOLEAN DEFAULT 0,
      kind TEXT,
      category_ids TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (currency_id) REFERENCES money_currency(id) ON DELETE SET NULL
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS money_asset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      ticker TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      category_ids TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS money_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      date DATETIME NOT NULL,
      account_id INTEGER,
      amount REAL NOT NULL,
      category_ids TEXT,
      kind TEXT,
      is_gift BOOLEAN DEFAULT 0,
      notes TEXT,
      details TEXT,
      twin_transaction_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES money_account(id) ON DELETE SET NULL,
      FOREIGN KEY (twin_transaction_id) REFERENCES money_transaction(id) ON DELETE SET NULL
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
