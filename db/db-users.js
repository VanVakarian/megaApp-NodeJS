import { getConnection } from './db.js';
import * as dbUtils from './utils.js';

export async function getUserByUsername(username) {
  const connection = await getConnection();
  try {
    const query = 'SELECT * FROM users WHERE username = ?';
    const result = await connection.get(query, [username]);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function createUser(username, hashedPassword) {
  const connection = await getConnection();
  try {
    const id = await dbUtils.generateUniqueId(2, connection, 'users');
    const query = 'INSERT INTO users (id, username, hashedPassword) VALUES (?, ?, ?)';
    const result = await connection.run(query, [id, username, hashedPassword]);
    return result.lastID;
  } catch (error) {
    console.error(error);
    return null;
  }
}
