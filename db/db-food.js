import { getConnection } from './db.js';

export async function getRangeOfUsersDiaryEntries(dateIsoStart, dateIsoEnd, userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT 
        id, strftime('%Y-%m-%d', date) AS date, foodCatalogueId, foodWeight, history
      FROM
        food_diary
      WHERE
        usersId = ?
        AND date BETWEEN ? AND ?
      ORDER BY
        date ASC, id ASC;
    `;
    const result = await connection.all(query, [userId, dateIsoStart, dateIsoEnd]);

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
        food_catalogue
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
