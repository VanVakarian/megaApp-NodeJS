import { getConnection } from './db.js';

export async function dbGetUsersSettings(userId) {
  const connection = await getConnection();
  try {
    const query = 'SELECT * FROM settings WHERE users_id = ?';
    const result = await connection.get(query, [userId]);

    if (result) {
      result.dark_theme = result.dark_theme === 1; // converting digits to boolean
      result.selected_chapter_food = result.selected_chapter_food === 1;
      result.selected_chapter_money = result.selected_chapter_money === 1;
    }

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function dbPostUsersSettings(userId, settings) {
  const connection = await getConnection();
  try {
    const checkQuery = 'SELECT COUNT(*) as count FROM settings WHERE users_id = ?';
    const checkResult = await connection.get(checkQuery, [userId]);

    if (checkResult.count > 0) {
      await dbUpdateUserSettings(userId, settings);
    } else {
      await dbCreateUserSettings(userId, settings);
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to save settings');
  }
}

export async function dbUpdateUserSettings(userId, settings) {
  const connection = await getConnection();
  try {
    const updateQuery = `
      UPDATE settings
      SET dark_theme = ?, selected_chapter_food = ?, selected_chapter_money = ?
      WHERE users_id = ?
    `;
    await connection.run(updateQuery, [
      settings.darkTheme,
      settings.selectedChapterFood,
      settings.selectedChapterMoney,
      userId,
    ]);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to update settings');
  }
}

export async function dbCreateUserSettings(userId, settings) {
  const connection = await getConnection();
  try {
    const insertQuery = `
        INSERT INTO settings (users_id, dark_theme, selected_chapter_food, selected_chapter_money)
        VALUES (?, ?, ?, ?)
      `;
    await connection.run(insertQuery, [
      userId,
      settings.darkTheme,
      settings.selectedChapterFood,
      settings.selectedChapterMoney,
    ]);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to create settings');
  }
}
