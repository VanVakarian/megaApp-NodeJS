import { open } from 'sqlite';
import * as sqliteVec from 'sqlite-vec';
import sqlite3 from 'sqlite3';
import { DB_FILE_NAME } from '../env.js';

let connectionCache = null;

export const getConnection = async () => {
  if (connectionCache) {
    return connectionCache;
  }

  const db = await open({
    filename: `${DB_FILE_NAME}`,
    driver: sqlite3.Database,
  });

  sqliteVec.load(db);
  connectionCache = db;

  return db;
};
