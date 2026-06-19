import { getConnection } from '../db/db.js';

export async function getUsersCoefficients(userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        coefficients
      FROM
        foodSettings
      WHERE
        usersId = ?;
    `;
    const result = await connection.get(query, [userId]);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function setUsersCoefficients(userId, coefficients) {
  const connection = await getConnection();
  try {
    const checkQuery = `
      SELECT
        COUNT(*) as count
      FROM
        foodSettings
      WHERE
        usersId = ?;
    `;
    const checkResult = await connection.get(checkQuery, [userId]);

    if (checkResult.count > 0) {
      await updateUserCoefficients(userId, coefficients);
    } else {
      await createUserCoefficients(userId, coefficients);
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function updateUserCoefficients(userId, coefficients) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodSettings
      SET
        coefficients = ?
      WHERE
        usersId = ?;
    `;
    await connection.run(query, [coefficients, userId]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createUserCoefficients(userId, coefficients) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodSettings (usersId, coefficients)
      VALUES
        (?, ?);
    `;
    await connection.run(query, [userId, coefficients]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
