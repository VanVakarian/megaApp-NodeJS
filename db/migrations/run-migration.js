import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { migration001to002 } from './001-to-002.js';
import { migration002to001 } from './002-to-001.js';
import { migration002to003 } from './002-to-003.js';
import { migration003to002 } from './003-to-002.js';
import { migration003to004populateData as migration003to004withPopulateData } from './003-to-004-and-populate-data.js';
import { migration003to004 } from './003-to-004.js';
import { migration004to003 } from './004-to-003.js';
import { migration004to005 } from './004-to-005.js';
import { migration005to004 } from './005-to-004.js';

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
  '003to004': {
    name: 'Migration from version 003 to 004 (PFCF fields)',
    queries: migration003to004,
    sourceVersion: '003',
    targetVersion: '004',
  },
  '003to004withPopulate': {
    name: 'Migration from version 003 to 004 (PFCF fields + populate user data)',
    queries: migration003to004withPopulateData,
    sourceVersion: '003',
    targetVersion: '004',
  },
  '004to003': {
    name: 'Rollback from version 004 to 003',
    queries: migration004to003,
    sourceVersion: '004',
    targetVersion: '003',
  },
  '004to005': {
    name: 'Migration from version 004 to 005 (Money categories v2)',
    queries: migration004to005,
    sourceVersion: '004',
    targetVersion: '005',
  },
  '005to004': {
    name: 'Rollback from version 005 to 004',
    queries: migration005to004,
    sourceVersion: '005',
    targetVersion: '004',
  },
};

/**
 * Parse database filename to extract components
 * Expected format: {name}-{env}-{version}.db or {name}-{env}-{version}
 * Example: megaapp-prod-002.db or megaapp-test-003
 */
function parseDbFileName(fileName) {
  // Remove .db extension if present
  const nameWithoutExt = fileName.endsWith('.db') ? fileName.slice(0, -3) : fileName;

  const parts = nameWithoutExt.split('-');

  if (parts.length < 3) {
    throw new Error(`Invalid database filename format: "${fileName}". Expected format: {name}-{env}-{version}.db`);
  }

  // Last part is version (digits only)
  const version = parts[parts.length - 1];
  if (!/^\d+$/.test(version)) {
    throw new Error(`Invalid version in filename "${fileName}". Version must be numeric (e.g., "002", "003")`);
  }

  // Second-to-last part is environment
  const env = parts[parts.length - 2];

  // Everything before env is the database name (can contain hyphens)
  const name = parts.slice(0, -2).join('-');

  return { name, env, version };
}

/**
 * Find database file by partial name in current directory
 * Can search by full name or partial name (without .db extension)
 */
function findDatabaseFile(searchPattern, currentDir = '.') {
  try {
    const files = fs.readdirSync(currentDir);
    const dbFiles = files.filter((f) => f.endsWith('.db'));

    if (dbFiles.length === 0) {
      throw new Error(`No database files (.db) found in directory: ${currentDir}`);
    }

    // Try exact match first (with or without .db)
    const searchWithoutExt = searchPattern.endsWith('.db') ? searchPattern.slice(0, -3) : searchPattern;
    const exactMatch = dbFiles.find(
      (f) => f === searchPattern || f === `${searchPattern}.db` || f.slice(0, -3) === searchWithoutExt,
    );

    if (exactMatch) {
      return path.join(currentDir, exactMatch);
    }

    // If search pattern contains env (e.g., "megaapp-prod"), find all matching
    const matches = dbFiles.filter((f) => f.includes(searchWithoutExt));

    if (matches.length === 1) {
      return path.join(currentDir, matches[0]);
    }

    if (matches.length > 1) {
      console.error(`Multiple database files match "${searchPattern}":`);
      matches.forEach((m) => console.error(`  - ${m}`));
      throw new Error('Please be more specific with the database filename');
    }

    console.error(`Available database files in ${currentDir}:`);
    dbFiles.forEach((f) => console.error(`  - ${f}`));
    throw new Error(`Database file "${searchPattern}" not found`);
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('No database')) {
      throw error;
    }
    throw new Error(`Error searching for database file: ${error.message}`);
  }
}

/**
 * Validate that migration matches the source database version
 */
function validateMigrationVersion(migration, sourceDbVersion) {
  if (migration.sourceVersion !== sourceDbVersion) {
    throw new Error(
      `Migration version mismatch: source database is version ${sourceDbVersion}, ` +
        `but migration ${migration.sourceVersion}→${migration.targetVersion} expects version ${migration.sourceVersion}`,
    );
  }
}

/**
 * Create backup of source database before migration
 */
async function createBackup(sourceFilePath) {
  const sourceDir = path.dirname(sourceFilePath);
  const backupsDir = path.join(sourceDir, 'backups');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sourceFileName = path.basename(sourceFilePath);
  const backupFileName = `backup-${sourceFileName.slice(0, -3)}-${timestamp}.db`;
  const backupPath = path.join(backupsDir, backupFileName);

  try {
    console.log(`Creating backup: ${backupFileName}`);
    fs.copyFileSync(sourceFilePath, backupPath);
    console.log(`✓ Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

/**
 * Main migration function
 */
function resolveTargetFilePath(targetPattern, sourceDir, migration) {
  if (!targetPattern) {
    return null;
  }

  const targetWithExt = targetPattern.endsWith('.db') ? targetPattern : `${targetPattern}.db`;
  const targetFileName = path.basename(targetWithExt);
  const targetParsed = parseDbFileName(targetFileName);

  if (targetParsed.version !== migration.targetVersion) {
    throw new Error(
      `Target version mismatch: migration ${migration.sourceVersion}→${migration.targetVersion} requires target version ${migration.targetVersion}, ` +
        `but target file is version ${targetParsed.version}`,
    );
  }

  const hasDirectory = targetWithExt.includes('/') || targetWithExt.includes('\\');
  return hasDirectory ? path.resolve(targetWithExt) : path.join(sourceDir, targetFileName);
}

async function runMigration(migrationKey, sourceDbPattern, targetDbPattern) {
  // Validate migration key
  if (!migrationKey) {
    console.error('Error: Please specify migration to run using --migration=<key>');
    console.log('\nAvailable migrations:');
    Object.keys(availableMigrations).forEach((key) => {
      const m = availableMigrations[key];
      console.log(`  --migration=${key}`);
      console.log(`    ${m.name}`);
    });
    process.exit(1);
  }

  const migration = availableMigrations[migrationKey];
  if (!migration) {
    console.error(`Error: Migration "${migrationKey}" not found`);
    console.log('\nAvailable migrations:');
    Object.keys(availableMigrations).forEach((key) => {
      const m = availableMigrations[key];
      console.log(`  --migration=${key}`);
      console.log(`    ${m.name}`);
    });
    process.exit(1);
  }

  // Validate source database parameter
  if (!sourceDbPattern) {
    console.error('Error: Please specify source database using --source=<filename>');
    console.log('\nExamples:');
    console.log('  node db/migrations/run-migration.js --migration=002to003 --source=megaapp-prod-002.db');
    console.log('  node db/migrations/run-migration.js --migration=002to003 --source=megaapp-prod-002');
    process.exit(1);
  }

  try {
    // Find source database file
    console.log(`\nSearching for source database: ${sourceDbPattern}`);
    const sourceFilePath = findDatabaseFile(sourceDbPattern);
    const sourceFileName = path.basename(sourceFilePath);

    // Parse source database filename
    const sourceParsed = parseDbFileName(sourceFileName);
    console.log(`✓ Found: ${sourceFileName}`);
    console.log(`  Name: ${sourceParsed.name}, Environment: ${sourceParsed.env}, Version: ${sourceParsed.version}`);

    // Validate migration version matches source version
    validateMigrationVersion(migration, sourceParsed.version);
    console.log(`✓ Migration version matches source database version: ${sourceParsed.version}`);

    const sourceDir = path.dirname(sourceFilePath);
    const autoTargetFileName = `${sourceParsed.name}-${sourceParsed.env}-${migration.targetVersion}.db`;
    const targetFilePath =
      resolveTargetFilePath(targetDbPattern, sourceDir, migration) ?? path.join(sourceDir, autoTargetFileName);
    const targetFileName = path.basename(targetFilePath);

    // Check if target already exists
    if (fs.existsSync(targetFilePath)) {
      console.log(`\nWarning: Target database already exists: ${targetFileName}`);
      console.log('It will be overwritten.');
    }

    // Create backup
    console.log(`\nCreating backup before migration...`);
    await createBackup(sourceFilePath);

    // Copy source to target
    console.log(`\nCopying ${sourceFileName} → ${targetFileName}`);
    fs.copyFileSync(sourceFilePath, targetFilePath);
    console.log(`✓ Database copied`);

    // Open and run migration
    console.log(`\nRunning migration: ${migration.name}...`);
    const connection = await open({
      filename: targetFilePath,
      driver: sqlite3.Database,
    });

    try {
      for (let i = 0; i < migration.queries.length; i++) {
        const query = migration.queries[i];
        await connection.exec(query);
        console.log(`  [${i + 1}/${migration.queries.length}] ✓`);
      }
      await connection.close();
      console.log(`\n✓ Migration completed successfully!`);
      console.log(`\nResult: ${targetFileName}`);
    } catch (error) {
      console.error(`\nError running migration:`, error);

      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }

      if (fs.existsSync(targetFilePath)) {
        console.log(`\nCleaning up failed migration file: ${targetFileName}`);
        fs.unlinkSync(targetFilePath);
      }

      throw error;
    }
  } catch (error) {
    console.error(`\nMigration failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseCliArguments() {
  const args = process.argv.slice(2);
  const result = {};

  for (const arg of args) {
    if (arg.startsWith('--migration=')) {
      result.migration = arg.split('=')[1];
    } else if (arg.startsWith('--source=')) {
      result.source = arg.split('=')[1];
    } else if (arg.startsWith('--target=')) {
      result.target = arg.split('=')[1];
    }
  }

  return result;
}

// Main execution
const { migration, source, target } = parseCliArguments();

runMigration(migration, source, target)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
