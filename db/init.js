import { getConnection } from './db.js';
import { RECHECK_DB, INIT_USERS } from '../env.js';

async function createTablesIfNotExist() {
  const connection = await getConnection();

  const createTablesQueries = [
    // `
    // CREATE TABLE IF NOT EXISTS food_stats (
    //   id TEXT PRIMARY KEY,
    //   up_to_date TEXT,
    //   stats TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_account (
    //   id TEXT PRIMARY KEY,
    //   title TEXT,
    //   currency_id INTEGER,
    //   bank_id INTEGER,
    //   invest BOOLEAN,
    //   kind TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_bank (
    //   id TEXT PRIMARY KEY,
    //   title TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_category (
    //   id TEXT PRIMARY KEY,
    //   title TEXT,
    //   kind TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_currency (
    //   id TEXT PRIMARY KEY,
    //   title TEXT,
    //   ticker TEXT,
    //   symbol TEXT,
    //   symbol_pos TEXT,
    //   whitespace BOOLEAN,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_transaction (
    //   id TEXT PRIMARY KEY,
    //   date DATE,
    //   amount REAL,
    //   account_id INTEGER,
    //   category_id INTEGER,
    //   kind TEXT,
    //   user_id INTEGER,
    //   twin_transaction_id INTEGER,
    //   is_gift BOOLEAN,
    //   notes TEXT
    // );
    // `,

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
      selectedChapterMoney BOOLEAN
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS foodDiary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER,
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
      date INTEGER,
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
  if (RECHECK_DB) {
    await createTablesIfNotExist();

    Object.entries(INIT_USERS).forEach(async ([key, value]) => {
      await addUserIfNotExists(value);
    });
  }
}
