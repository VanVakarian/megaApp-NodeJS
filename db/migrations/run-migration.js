import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import * as sqliteVec from 'sqlite-vec';
import sqlite3 from 'sqlite3';
import { DB_ENV, DB_FILE_NAME, DB_NAME } from '../../env.js';
import { migration001to002 } from './001-to-002.js';
import { migration002to001 } from './002-to-001.js';
import { migration002to003 } from './002-to-003.js';
import { migration003to002 } from './003-to-002.js';

const availableMigrations = {
  '001to002': {
    name: 'Migration from version 001 to 002',
    queries: migration001to002,
    sourceVersion: '001',
    targetVersion: '002',
  },
  '002to001': {
    name: 'Rollback from version 002 to 001',
    queries: migration002to001,
    sourceVersion: '002',
    targetVersion: '001',
  },
  '002to003': {
    name: 'Migration from version 002 to 003 (Catalogue Revamp)',
    queries: migration002to003,
    sourceVersion: '002',
    targetVersion: '003',
  },
  '003to002': {
    name: 'Rollback from version 003 to 002',
    queries: migration003to002,
    sourceVersion: '003',
    targetVersion: '002',
  },
};

async function createBackup(migrationKey) {
  const backupsDir = path.join(path.dirname(import.meta.url.replace('file://', '')), 'backups');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-before-migration-${migrationKey}-${timestamp}.db`;
  const backupPath = path.join(backupsDir, backupFileName);

  try {
    console.log(`Creating backup: ${backupFileName}`);
    fs.copyFileSync(DB_FILE_NAME, backupPath);
    console.log(`Backup created successfully at: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

async function runMigration(migrationKey) {
  if (!migrationKey) {
    console.error('Please specify migration to run');
    console.log('Available migrations:');
    Object.keys(availableMigrations).forEach((key) => {
      console.log(`  - ${key}: ${availableMigrations[key].name}`);
    });
    process.exit(1);
  }

  const migration = availableMigrations[migrationKey];
  if (!migration) {
    console.error(`Migration "${migrationKey}" not found`);
    console.log('Available migrations:');
    Object.keys(availableMigrations).forEach((key) => {
      console.log(`  - ${key}: ${availableMigrations[key].name}`);
    });
    process.exit(1);
  }

  try {
    await createBackup(migrationKey);
  } catch (error) {
    console.error('Failed to create backup. Migration aborted.');
    throw error;
  }

  console.log(`Starting ${migration.name}...`);

  const sourceFileName = `${DB_NAME}-${DB_ENV}-${migration.sourceVersion}.db`;
  const targetFileName = `${DB_NAME}-${DB_ENV}-${migration.targetVersion}.db`;

  if (!fs.existsSync(sourceFileName)) {
    console.error(`Source database file ${sourceFileName} not found`);
    process.exit(1);
  }

  if (fs.existsSync(targetFileName)) {
    console.log(`Target database file ${targetFileName} already exists, overwriting...`);
    fs.unlinkSync(targetFileName);
  }

  console.log(`Copying ${sourceFileName} to ${targetFileName}`);
  fs.copyFileSync(sourceFileName, targetFileName);

  const connection = await open({
    filename: targetFileName,
    driver: sqlite3.Database,
  });

  sqliteVec.load(connection);

  try {
    for (const query of migration.queries) {
      await connection.exec(query);
    }
    await connection.close();
    console.log(`${migration.name} completed successfully`);
  } catch (error) {
    console.error(`Error running ${migration.name}:`, error);

    try {
      await connection.close();
    } catch (closeError) {
      console.error('Error closing connection:', closeError);
    }

    if (fs.existsSync(targetFileName)) {
      console.log(`Cleaning up failed migration file: ${targetFileName}`);
      fs.unlinkSync(targetFileName);
    }

    throw error;
  }
}

function parseCliArguments() {
  const args = process.argv.slice(2);

  for (const arg of args) {
    if (arg.startsWith('--migration=')) {
      return arg.split('=')[1];
    }
  }

  return null;
}

const migrationKey = parseCliArguments();

runMigration(migrationKey)
  .then(() => {
    console.log('Migration finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
