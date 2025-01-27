import pkg from 'pg';
import { getConnection } from '../../../db/db.js';
import * as env from '../../../env.js';

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

export async function dbCreateDiaryEntry(dateISO, foodCatalogueId, foodWeight, history, userId) {
  // First create entry in PostgreSQL to get ID
  const pgClient = await getPGClient();
  let pgId = null;

  try {
    // Insert into PostgreSQL first
    const pgQuery = `
      INSERT INTO
        diary (date, catalogue_id, food_weight, users_id)
      VALUES
        ($1, $2, $3, $4)
      RETURNING
        id;
    `;
    const pgResult = await pgClient.query(pgQuery, [dateISO, foodCatalogueId, foodWeight, userId]);
    pgId = pgResult.rows[0].id;

    // Then insert into SQLite with the same ID
    const sqliteConnection = await getConnection();
    const sqliteQuery = `
      INSERT INTO
        foodDiary (id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    await sqliteConnection.run(sqliteQuery, [pgId, dateISO, foodCatalogueId, foodWeight, history, userId, 0, 0]);

    return pgId;
  } catch (error) {
    console.error('Error in dbCreateDiaryEntry during migration:', error);
    // If SQLite insert fails after successful PG insert, we should roll back PG
    if (pgId) {
      try {
        await pgClient.query('DELETE FROM diary WHERE id = $1', [pgId]);
      } catch (rollbackError) {
        console.error('Failed to rollback PostgreSQL insert:', rollbackError);
      }
    }
    return null;
  }
}

export async function dbEditDiaryEntry(foodWeight, historyStr, diaryId, userId) {
  const pgClient = await getPGClient();
  let pgResult;
  let originalWeight;

  try {
    // Saving original value for possible rollback
    const getOriginalQuery = 'SELECT food_weight FROM diary WHERE id = $1 AND users_id = $2';
    const originalData = await pgClient.query(getOriginalQuery, [diaryId, userId]);
    originalWeight = originalData.rows[0]?.food_weight;

    if (!originalWeight) {
      throw new Error('Entry not found in legacy DB');
    }

    // First update in PostgreSQL
    const pgQuery = `
      UPDATE
        diary
      SET
        food_weight = $1
      WHERE
        id = $2
        AND users_id = $3
      RETURNING
        id;
    `;
    pgResult = await pgClient.query(pgQuery, [foodWeight, diaryId, userId]);

    if (pgResult.rows.length === 0) {
      throw new Error('Entry not found in legacy DB');
    }

    // Updating in SQLite after successful update in PostgreSQL
    const sqliteConnection = await getConnection();
    const sqliteQuery = `
      UPDATE
        foodDiary
      SET
        foodWeight = ?,
        history = ?
      WHERE
        id = ?
        AND usersId = ?;
    `;
    await sqliteConnection.run(sqliteQuery, [foodWeight, historyStr, diaryId, userId]);

    return true;
  } catch (error) {
    console.error('Error in dbEditDiaryEntry during migration:', error);
    // If the update in SQLite fails, rollback the PostgreSQL update
    if (pgResult?.rows?.length > 0 && originalWeight) {
      try {
        await pgClient.query(
          `
          UPDATE
            diary
          SET
            food_weight = $1
          WHERE
            id = $2
            AND users_id = $3
        `,
          [originalWeight, diaryId, userId]
        );
      } catch (rollbackError) {
        console.error('Failed to rollback PostgreSQL update:', rollbackError);
      }
    }
    return false;
  }
}

export async function dbDeleteDiaryEntry(diaryId, userId) {
  try {
    // First delete from SQLite
    const sqliteConnection = await getConnection();
    const sqliteQuery = `
      DELETE FROM
        foodDiary
      WHERE
        id = ?
        AND usersId = ?;
    `;
    const sqliteResult = await sqliteConnection.run(sqliteQuery, [diaryId, userId]);

    if (sqliteResult.changes === 0) {
      return false;
    }

    // Deleting from PostgreSQL after successful delete from SQLite
    const pgClient = await getPGClient();
    try {
      await pgClient.query(
        `
        DELETE FROM
          diary
        WHERE
          id = $1
          AND users_id = $2;
      `,
        [diaryId, userId]
      );
    } catch (pgError) {
      console.error('Error deleting from PostgreSQL (ignored):', pgError);
    }

    return true;
  } catch (error) {
    console.error('Error in dbDeleteDiaryEntry:', error);
    return false;
  }
}

// Clean up PostgreSQL connection on process exit
process.on('exit', async () => {
  if (pgClient) {
    await pgClient.end();
  }
});
