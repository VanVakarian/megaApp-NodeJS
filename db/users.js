import { getConnection } from './db.js';

export const dbCreateUser = async (username, hashedPassword) => {
  const connection = await getConnection();
  try {
    const query = 'INSERT INTO users (username, hashed_password) VALUES (?, ?)';
    const result = await connection.run(query, [username, hashedPassword]);
    return result.lastID;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const dbGetUserByUsername = async (username) => {
  const connection = await getConnection();
  try {
    const query = 'SELECT * FROM users WHERE username = ?';
    const result = await connection.get(query, [username]);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};
