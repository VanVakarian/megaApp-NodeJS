import { getConnection } from './db.js';

export async function createUser(username, hashedPassword) {
  const connection = await getConnection();
  try {
    const query = 'INSERT INTO users (username, hashedPassword) VALUES (?, ?)';
    const result = await connection.run(query, [username, hashedPassword]);
    return result.lastID;
  } catch (error) {
    console.error(error);
    return null;
  }
}

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

export async function isUserAdmin(userId) {
  const connection = await getConnection();
  try {
    const query = 'SELECT isAdmin FROM users WHERE id = ?';
    const result = await connection.get(query, [userId]);

    if (result && result.isAdmin !== null) {
      return result.isAdmin === true || result.isAdmin === 1;
    } else {
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}
