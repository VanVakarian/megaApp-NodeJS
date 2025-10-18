import { open } from 'sqlite';
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

  connectionCache = db;

  return db;
};
