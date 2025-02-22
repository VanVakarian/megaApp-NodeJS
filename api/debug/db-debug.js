import { getConnection } from '../../db/db.js';

// ========================================================================================================== BACKUP ===

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
        dateISO = ?
      ORDER BY
        dateISO ASC;
    `;
    const result = await connection.all(query, [dateISO]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function insertFoodDiaryEntry(entry) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodDiary (id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    await connection.run(query, [
      entry.id,
      entry.dateISO,
      entry.foodCatalogueId,
      entry.foodWeight,
      entry.history,
      entry.usersId,
      entry.ver || 0,
      entry.del || 0,
    ]);
  } catch (error) {
    console.error(error);
  }
}

export async function insertBodyWeightEntry(entry) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodBodyWeight (id, dateISO, weight, usersId)
      VALUES
        (?, ?, ?, ?);
    `;
    await connection.run(query, [entry.id, entry.dateISO, entry.weight, entry.usersId]);
  } catch (error) {
    console.error(error);
  }
}

export async function clearDateData(dateISO) {
  const connection = await getConnection();
  try {
    await connection.run('DELETE FROM foodDiary WHERE dateISO = ?', [dateISO]);
    await connection.run('DELETE FROM foodBodyWeight WHERE dateISO = ?', [dateISO]);
  } catch (error) {
    console.error(error);
  }
}

export async function getAllFoodDiaryEntries() {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        *
      FROM
        foodDiary
      WHERE
        del = 0
      ORDER BY
        dateISO ASC
    `;
    return await connection.all(query);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function deleteFoodDiaryEntriesByIds(ids) {
  if (!ids.length) return;
  const connection = await getConnection();
  try {
    const placeholders = ids.map(() => '?').join(',');
    const query = `
      DELETE FROM
        foodDiary
      WHERE
        id IN (${placeholders})
    `;
    await connection.run(query, ids);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function insertFoodDiaryEntries(entries) {
  if (!entries.length) return;
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodDiary (id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const entry of entries) {
      await connection.run(query, [
        entry.id,
        entry.dateISO,
        entry.foodCatalogueId,
        entry.foodWeight,
        entry.history,
        entry.usersId,
        entry.ver || 0,
        entry.del || 0,
      ]);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// ================================================================================================= STEPS CSV TO DB ===

export async function dbSaveWalkSteps(steps, dateISO, userId) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT OR REPLACE INTO
        userActivity (dateISO, activityType, value, usersId)
      VALUES
        (?, 'steps', ?, ?);
    `;
    const result = await connection.run(query, [dateISO, steps, userId]);
    return result.lastID;
  } catch (error) {
    console.error('Error saving walk steps:', error);
    throw error;
  }
}

// ========================================================================================================= ON EXIT ===

process.on('exit', async () => {
  if (pgClient) {
    await pgClient.end();
  }
});
