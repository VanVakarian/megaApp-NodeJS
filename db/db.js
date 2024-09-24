import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

export const getConnection = async () => {
  return open({
    filename: 'megaapp.db',
    driver: sqlite3.Database,
  });
};
