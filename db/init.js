import { getConnection } from './db.js';

const createTables = async () => {
  const connection = await getConnection();

  const createTablesQueries = [
    // `
    // CREATE TABLE IF NOT EXISTS food_body_weight (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   date DATE,
    //   weight NUMERIC,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS food_settings (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   height INTEGER,
    //   use_coeffs BOOLEAN,
    //   coefficients TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS food_stats (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   up_to_date TEXT,
    //   stats TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS food_users_catalogue (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   food_id_list TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_account (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   title TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_category (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   title TEXT,
    //   kind TEXT,
    //   user_id INTEGER
    // );
    // `,

    // `
    // CREATE TABLE IF NOT EXISTS money_currency (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      hashedPassword TEXT
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usersId INTEGER NOT NULL,
      darkTheme BOOLEAN NOT NULL,
      selectedChapterFood BOOLEAN NOT NULL,
      selectedChapterMoney BOOLEAN NOT NULL
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS food_catalogue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      kcals INTEGER
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS food_diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE,
      foodCatalogueId INTEGER,
      foodWeight INTEGER,
      history TEXT,
      usersId INTEGER
    );
    `,

    `
    CREATE TABLE IF NOT EXISTS food_body_weight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE,
      weight NUMERIC,
      usersId INTEGER
    );
    `,
  ];

  try {
    for (const query of createTablesQueries) {
      await connection.exec(query);
    }
    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
};

const initDatabase = () => {
  createTables();
};

export default initDatabase;
