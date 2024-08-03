import { getConnection } from './db.js';

export async function getRangeOfUsersDiaryEntries(userId, startDateUnix, endDateUnix) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT 
        id, date, foodCatalogueId, foodWeight, history
      FROM
        foodDiary
      WHERE
        usersId = ?
        AND date BETWEEN ? AND ?
      ORDER BY
        date ASC;
      `;
    const result = await connection.all(query, [userId, startDateUnix, endDateUnix]);

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getRangeOfUsersBodyWeightEntries(userId, startDateUnix, endDateUnix) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT 
        id, date, weight
      FROM
        foodBodyWeight
      WHERE
        usersId = ?
        AND date BETWEEN ? AND ?
      ORDER BY
        date ASC;
      `;
    const result = await connection.all(query, [userId, startDateUnix, endDateUnix]);

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getAllFoodCatalogueEntries() {
  const connection = await getConnection();
  try {
    const query = `
      SELECT 
        id, name, kcals
      FROM
        foodCatalogue
      ORDER BY
        name ASC;
    `;
    const result = await connection.all(query);

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}
export async function dbGetDiaryEntrysHistory(diaryId, userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT 
        history
      FROM
        foodDiary
      WHERE
        id = ?
        AND usersId = ?;
    `;
    const result = await connection.all(query, [diaryId, userId]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function db_edit_diary_entry(foodWeight, history, diaryId, userId) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE 
        foodDiary 
      SET
        foodWeight = ?, history = ?
      WHERE
        id = ?
        AND usersId = ?;
    `;
    const values = [foodWeight, history, diaryId, userId];
    await connection.run(query, values);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
