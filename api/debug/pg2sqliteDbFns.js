import pkg from 'pg';
import { PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD } from '../../env.js';
import { getConnection } from '../../db/db.js';

const { Client } = pkg;

const postgresConfig = {
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
};

const PGClient = new Client(postgresConfig);
await PGClient.connect();

export const PGService = {
  async readSourceCatalogue() {
    const res = await PGClient.query(`
      SELECT id, name, kcals, users_id, helth
      FROM catalogue
      ORDER BY id ASC;
    `);
    return res.rows;
  },

  async readSourceDiary() {
    const res = await PGClient.query(`
      SELECT id, date, catalogue_id, food_weight, users_id
      FROM diary
      ORDER BY id ASC;
    `);
    return res.rows;
  },

  async readSourceWeights() {
    const res = await PGClient.query(`
      SELECT id, date, weight, users_id
      FROM weights
      ORDER BY id ASC;
    `);
    return res.rows;
  },
};

const BATCH_SIZE = 500;

export const sqliteService = {
  async writeTargetCatalogue(listOfDicts) {
    const connection = await getConnection();
    for (let i = 0; i < listOfDicts.length; i += BATCH_SIZE) {
      const batch = listOfDicts.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
      const values = batch.flatMap((item) => [item.id, item.name, item.kcals]);
      await connection.run(
        `
        INSERT INTO food_catalogue (id, name, kcals)
        VALUES ${placeholders}
      `,
        values
      );
    }
  },

  async writeTargetDiary(listOfDicts) {
    const connection = await getConnection();
    for (let i = 0; i < listOfDicts.length; i += BATCH_SIZE) {
      const batch = listOfDicts.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = batch.flatMap((item) => [
        item.date,
        item.catalogue_id,
        item.food_weight,
        JSON.stringify([]),
        item.users_id,
      ]);
      await connection.run(
        `
        INSERT INTO food_diary (date, foodCatalogueId, foodWeight, history, usersId)
        VALUES ${placeholders}
      `,
        values
      );
    }
  },

  async writeTargetWeights(listOfDicts) {
    const connection = await getConnection();
    for (let i = 0; i < listOfDicts.length; i += BATCH_SIZE) {
      const batch = listOfDicts.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
      const values = batch.flatMap((item) => [item.date, item.weight, item.users_id]);
      await connection.run(
        `
        INSERT INTO food_body_weight (date, weight, usersId)
        VALUES ${placeholders}
      `,
        values
      );
    }
  },

  async clearTargetTables() {
    const connection = await getConnection();
    await connection.run(`DELETE FROM food_catalogue;`);
    await connection.run(`DELETE FROM food_diary;`);
    await connection.run(`DELETE FROM food_body_weight;`);
    await connection.run(`DELETE FROM sqlite_sequence WHERE name IN ('food_diary', 'food_body_weight', 'food_catalogue');`);
  },
};
