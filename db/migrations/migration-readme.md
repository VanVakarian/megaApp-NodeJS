# Database Migration System

## Database File Naming Convention

Database files must follow this pattern: `megaapp-{version}-{suffix}.db`

- **version**: 3-digit version number (e.g., `001`, `002`)
- **suffix**: environment identifier (e.g., `prod`, `test`, `dev`)

Examples:
- `megaapp-001-prod.db`
- `megaapp-002-test.db`
- `megaapp-003-dev.db`

The migration system automatically extracts the suffix from `DB_FILE_NAME` in `env.js` using regex: `/megaapp-\d{3}-(.+)\.db$/`

## Running Migrations

### Command Format
```bash
node db/migrations/run-migration.js {migration-key}
```

### Available Migrations
- `001to002` - Migrate from version 001 to 002 (adds money tables)
- `002to001` - Rollback from version 002 to 001 (removes money tables)

### Examples
```bash
# Migrate forward
node db/migrations/run-migration.js 001to002

# Rollback
node db/migrations/run-migration.js 002to001
```

## What Happens During Migration

1. **Backup Creation**: Creates timestamped backup in `backups/` directory
2. **File Copying**: Copies source database file to target version (e.g., `megaapp-001-prod.db` → `megaapp-002-prod.db`)
3. **Schema Changes**: Executes SQL queries on the new target file
4. **Error Handling**: Removes target file if SQL execution fails, leaving source file intact

## Adding New Migrations

1. Create migration files (e.g., `002-to-003.js`, `003-to-002.js`)
2. Add to `availableMigrations` object in `run-migration.js`:
```javascript
'002to003': {
  name: 'Migration from version 002 to 003',
  queries: migration002to003,
  sourceVersion: '002',
  targetVersion: '003',
}
```

## Important Notes

- Always backup your database before running migrations
- Migration copies source file to target file, leaving original intact
- Failed migrations will clean up the target file automatically
- Source file serves as natural backup during migration process
- Check logs for detailed migration progress
