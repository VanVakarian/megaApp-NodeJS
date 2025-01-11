import pkg from 'pg';

import { getConnection } from '../../db/db.js';
import * as env from '../../env.js';

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
    return result.map(row => row.id);
  } catch (error) {
    console.error(error);
    return [];
  }
}

process.on('exit', async () => {
  if (pgClient) {
    await pgClient.end();
  }
});
