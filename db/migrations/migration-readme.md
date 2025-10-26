# Database Migration System

## Database File Naming Convention

Database files must follow this pattern: `{DB_NAME}-{ENV}-{VERSION}.db`

- **DB_NAME**: application name (e.g., `megaapp`)
- **ENV**: environment identifier (e.g., `prod`, `test`, `dev`)
- **VERSION**: version number (e.g., `001`, `002`, `003`)

Examples:
- `megaapp-prod-002.db`
- `megaapp-test-003.db`
- `megaapp-dev-001.db`

## Running Migrations

### Command Format
```bash
node db/migrations/run-migration.js --migration={migration-key} --source={source-database}
```

### Parameters

- **`--migration`** (required): Migration type to run
  - `001to002` - Migrate from version 001 to 002
  - `002to003` - Migrate from version 002 to 003 (Catalogue Revamp)
  - `002to001` - Rollback from version 002 to 001
  - `003to002` - Rollback from version 003 to 002

- **`--source`** (required): Source database file
  - Can be full filename: `megaapp-prod-002.db`
  - Or filename without extension: `megaapp-prod-002`
  - Or partial pattern: `megaapp-prod` (if only one version exists)

### Examples

```bash
# Migrate prod database from v002 to v003
node db/migrations/run-migration.js --migration=002to003 --source=megaapp-prod-002.db

# Migrate test database (shorter syntax)
node db/migrations/run-migration.js --migration=002to003 --source=megaapp-test-002

# If only one database in directory, can use pattern
node db/migrations/run-migration.js --migration=002to003 --source=megaapp-prod
```

## Key Features

### Automatic Environment & Name Detection
- The script automatically extracts database name and environment from the filename
- No need to modify `env.js` before running migrations
- Migration version is verified against source database version

### Smart File Discovery
- If multiple files match the pattern, script will ask for clarification
- Available files are listed when search fails

### Automatic Backup
- Creates timestamped backup in `backups/` directory before migration
- Original source file remains unchanged
- Target file is created with new version number

### Example Workflow

1. You download `megaapp-prod-002.db` from production
2. Run migration:
   ```bash
   node db/migrations/run-migration.js --migration=002to003 --source=megaapp-prod-002
   ```
3. Script automatically:
   - Detects: name=megaapp, env=prod, sourceVersion=002
   - Validates: migration expects source version 002 ✓
   - Creates backup: `backups/backup-megaapp-prod-002-2025-10-19T...db`
   - Creates result: `megaapp-prod-003.db` (in same directory)
   - Runs all migration queries on the new file

## Error Handling

- **Migration version mismatch**: Script validates that source database version matches migration source version
- **File not found**: Lists available database files in current directory
- **SQL errors**: Automatically cleans up partial target file, leaving source intact
- **Multiple matches**: Asks for clarification when search pattern matches multiple files

## What Happens During Migration

1. **Search**: Finds source database file matching the pattern
2. **Parse**: Extracts name, environment, and version from filename
3. **Validate**: Ensures migration version matches source version
4. **Backup**: Creates timestamped backup of source file
5. **Copy**: Creates target file with new version number
6. **Migrate**: Executes all SQL queries on target file
7. **Cleanup**: If migration fails, removes partial target file

## Adding New Migrations

1. Create migration files (e.g., `002-to-003.js`, `003-to-002.js`)
   ```javascript
   export const migration002to003 = [
     `ALTER TABLE table_name ADD COLUMN new_column TEXT;`,
     // ... more queries
   ];
   ```

2. Add reverse migration (e.g., `003-to-002.js`)

3. Add to `db-schemas.js` with schema for version 003

4. Register in `run-migration.js`:
   ```javascript
   '002to003': {
     name: 'Migration from version 002 to 003',
     queries: migration002to003,
     sourceVersion: '002',
     targetVersion: '003',
   }
   ```

## Important Notes

- ✓ No need to modify `env.js` before running migrations
- ✓ Source database file remains unchanged (safe backup)
- ✓ Automatic version validation prevents mistakes
- ✓ Failed migrations automatically clean up partial results
- ✓ All backups stored in `backups/` directory with timestamps
