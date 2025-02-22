import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { DB_NAME } from '../env.js';

export const getConnection = async () => {
  return open({
    filename: `${DB_NAME}.db`,
    driver: sqlite3.Database,
  });
};
