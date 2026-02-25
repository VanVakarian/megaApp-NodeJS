import {
  DB_VERSION,
  DEV_MODE_FORCE_RECREATE_TABLES,
  DEV_MODE_INIT_USERS,
  DEV_MODE_POPULATE_DB,
  DEV_MODE_TABLES_TO_DELETE,
} from '../env.js';
import { getConnection } from './db.js';
import { dbSchemas } from './migrations/db-schemas.js';

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

  const currentSchema = dbSchemas[DB_VERSION];
  if (!currentSchema) {
    throw new Error(`Database schema version ${DB_VERSION} not found`);
  }

  try {
    for (const query of currentSchema) {
      await connection.exec(query);
    }
    // console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

async function populateDatabase() {
  console.log('Database population is temporarily moved to a separate migration script.');
}
