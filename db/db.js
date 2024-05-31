import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

export const getConnection = async () => {
  return open({
    filename: 'main.db',
    driver: sqlite3.Database,
  });
};
