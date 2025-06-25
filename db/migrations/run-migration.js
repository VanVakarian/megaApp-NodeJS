import fs from 'fs';
import path from 'path';
import { DB_FILE_NAME } from '../../env.js';
import { getConnection } from '../db.js';
import { migration001to002 } from './001-to-002.js';
import { migration002to001 } from './002-to-001.js';

const availableMigrations = {
  '001to002': {
    name: 'Migration from version 001 to 002',
    queries: migration001to002,
  },
  '002to001': {
    name: 'Rollback from version 002 to 001',
    queries: migration002to001,
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

  const connection = await getConnection();

  console.log(`Starting ${migration.name}...`);

  try {
    for (const query of migration.queries) {
      await connection.exec(query);
    }
    console.log(`${migration.name} completed successfully`);
  } catch (error) {
    console.error(`Error running ${migration.name}:`, error);
    throw error;
  }
}

const migrationKey = process.argv[2];

runMigration(migrationKey)
  .then(() => {
    console.log('Migration finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
