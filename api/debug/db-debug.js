import pkg from 'pg';

import { getConnection } from '../../db/db.js';
import * as env from '../../env.js';

// =================================================================================================== TEMP TRANSFER ===

const BATCH_SIZE = 500;

const { Client } = pkg;

const postgresConfig = {
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
};

let pgClient = null;

async function getPGClient() {
  if (!pgClient) {
    pgClient = new Client(postgresConfig);
    await pgClient.connect();
  }
  return pgClient;
}

export async function readSourceDiary(userId) {
  const client = await getPGClient();
  try {
    const res = await client.query(
      `
      SELECT
        id, date::text AS date, catalogue_id, food_weight, users_id
      FROM
        diary
      WHERE
        users_id = $1
      ORDER BY
        date ASC, id ASC;
    `,
      [userId]
    );
    return res.rows;
  } catch (error) {
    console.error('Error in readSourceDiary:', error);
    throw error;
  }
}

export async function readSourceWeights(userId) {
  const client = await getPGClient();
  try {
    const res = await client.query(
      `
      SELECT
        id, date::text AS date, weight, users_id
      FROM
        weights
      WHERE
        users_id = $1
      ORDER BY
        date ASC;
      `,
      [userId]
    );
    return res.rows;
  } catch (error) {
    console.error('Error in readSourceWeights:', error);
    throw error;
  }
}

export async function readSourceCatalogue() {
  const client = await getPGClient();
  try {
    const res = await client.query(
      `
      SELECT
        id, name, kcals, users_id, helth
      FROM
        catalogue
      ORDER BY
        id ASC;
      `
    );
    return res.rows;
  } catch (error) {
    console.error('Error in readSourceCatalogue:', error);
    throw error;
  }
}

export async function readSourceSettings() {
  const client = await getPGClient();
  try {
    const res = await client.query(
      `
      SELECT
        id, height, use_coeffs, coefficients, user_id
      FROM
        options
      ORDER BY
        id ASC;
      `
    );
    return res.rows;
  } catch (error) {
    console.error('Error in readSourceSettings:', error);
    throw error;
  }
}

export async function clearTargetTableOfUser(tableName, userId) {
  const connection = await getConnection();
  await connection.run(`DELETE FROM ${tableName} WHERE usersId = ?;`, [userId]);
}

export async function clearWholeTargetTable(tableName) {
  const connection = await getConnection();
  await connection.run(`DELETE FROM ${tableName};`);
}

export async function writeTargetDiary(listOfDicts) {
  const connection = await getConnection();

  for (let i = 0; i < listOfDicts.length; i += BATCH_SIZE) {
    const batch = listOfDicts.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = batch.flatMap((item) => [
      item.id,
      item.date,
      item.catalogue_id,
      item.food_weight,
      JSON.stringify([]),
      item.users_id,
      1,
      false,
    ]);

    await connection.run(
      `
      INSERT INTO
        foodDiary (id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
      VALUES
        ${placeholders}
      `,
      values
    );
  }
}

export async function writeTargetWeights(listOfDicts) {
  const connection = await getConnection();
  for (let i = 0; i < listOfDicts.length; i += BATCH_SIZE) {
    const batch = listOfDicts.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
    const values = batch.flatMap((item) => [item.date, item.weight, item.users_id]);
    await connection.run(
      `
      INSERT INTO
        foodBodyWeight (dateISO, weight, usersId)
      VALUES
        ${placeholders}
      `,
      values
    );
  }
}

export async function writeTargetCatalogue(listOfDicts) {
  const connection = await getConnection();
  for (let i = 0; i < listOfDicts.length; i += BATCH_SIZE) {
    const batch = listOfDicts.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
    const values = batch.flatMap((item) => [item.id, item.name, item.kcals]);
    await connection.run(
      `
      INSERT INTO
        foodCatalogue (id, name, kcals)
      VALUES
        ${placeholders}
      `,
      values
    );
  }
}

export async function writeTargetFoodSettings(listOfDicts) {
  const connection = await getConnection();
  const placeholders = listOfDicts.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const values = listOfDicts.flatMap((item) => [
    item.height,
    item.use_coeffs,
    item.coefficients,
    item.selectedCatalogueIds,
    item.user_id,
  ]);

  await connection.run(
    `
    INSERT INTO
      foodSettings (height, useCoeffs, coefficients, selectedCatalogueIds, usersId)
    VALUES
      ${placeholders}
    `,
    values
  );
}

export async function getExistingDiaryIds(userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id
      FROM
        foodDiary
      WHERE
        usersId = ?
    `;
    const result = await connection.all(query, [userId]);
    return result.map((row) => row.id);
  } catch (error) {
    console.error(error);
    return [];
  }
}

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
      SELECT *
      FROM foodDiary
      WHERE del = 0
      ORDER BY dateISO ASC
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
      DELETE FROM foodDiary
      WHERE id IN (${placeholders})
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
      INSERT INTO foodDiary (id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

// ========================================================================================================= ON EXIT ===

process.on('exit', async () => {
  if (pgClient) {
    await pgClient.end();
  }
});
