import { getConnection } from '../db/db.js';

export async function getAllDates() {
  const db = await getConnection();
  const query = `
    SELECT DISTINCT
      dateISO as date
    FROM (
      SELECT
        dateISO
      FROM
        foodDiary
      UNION
      SELECT
        dateISO
      FROM
        foodBodyWeight
    )
    ORDER BY
      date ASC
  `;
  const dates = await db.all(query);
  await db.close();
  return dates.map((row) => row.date);
}

export async function getFoodDiaryByDate(dateISO) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        *
      FROM
        foodDiary
      WHERE
        dateISO = ?;
    `;
    const result = await connection.all(query, [dateISO]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getBodyWeightByDate(dateISO) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        *
      FROM
        foodBodyWeight
      WHERE
        dateISO = ?;
    `;
    const result = await connection.all(query, [dateISO]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}
