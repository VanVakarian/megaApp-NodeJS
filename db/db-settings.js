import { getConnection } from './db.js';

export async function getUsersSettings(userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        darkTheme, selectedChapterFood, selectedChapterMoney, height
      FROM
        settings
      WHERE
        usersId = ?
    `;
    const result = await connection.get(query, [userId]);

    if (result) {
      result.darkTheme = result.darkTheme === 1; // converting digits to boolean
      result.selectedChapterFood = result.selectedChapterFood === 1;
      result.selectedChapterMoney = result.selectedChapterMoney === 1;
    }

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function postUsersSettings(userId, settings) {
  const connection = await getConnection();
  try {
    const checkQuery = `
      SELECT
        COUNT(*) as count
      FROM
        settings
      WHERE
        usersId = ?
    `;
    const checkResult = await connection.get(checkQuery, [userId]);

    if (checkResult.count > 0) {
      await updateUserSettings(userId, settings);
    } else {
      await createUserSettings(userId, settings);
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to save settings');
  }
}

export async function updateUserSettings(userId, settings) {
  const connection = await getConnection();
  try {
    const updateQuery = `
      UPDATE
        settings
      SET
        darkTheme = ?, selectedChapterFood = ?, selectedChapterMoney = ?, height = ?
      WHERE
        usersId = ?
    `;
    await connection.run(updateQuery, [
      settings.darkTheme,
      settings.selectedChapterFood,
      settings.selectedChapterMoney,
      settings.height,
      userId,
    ]);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to update settings');
  }
}

export async function createUserSettings(userId, settings) {
  const connection = await getConnection();
  try {
    const insertQuery = `
      INSERT INTO
        settings (usersId, darkTheme, selectedChapterFood, selectedChapterMoney, height)
      VALUES
        (?, ?, ?, ?, ?)
    `;
    await connection.run(insertQuery, [
      userId,
      settings.darkTheme,
      settings.selectedChapterFood,
      settings.selectedChapterMoney,
      settings.height,
    ]);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to create settings');
  }
}
