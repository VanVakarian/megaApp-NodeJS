import { getConnection } from './db.js';

export const dbCreateUser = async (username, hashedPassword) => {
  const connection = await getConnection();
  try {
    const result = await connection.run(
      'INSERT INTO users (username, hashed_password) VALUES (?, ?)',
      [username, hashedPassword]
    );
    return result.lastID;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const dbGetUserByUsername = async (username) => {
  const connection = await getConnection();
  try {
    const result = await connection.get(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};
