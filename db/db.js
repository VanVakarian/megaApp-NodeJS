import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { DB_FILE_NAME } from '../env.js';

export const getConnection = async () => {
  return open({
    filename: `${DB_FILE_NAME}`,
    driver: sqlite3.Database,
  });
};
