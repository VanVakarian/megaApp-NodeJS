# S3 Backup Cleanup Utility

Utility for automatic cleanup of old S3 backups. Keeps one file per past month, removes duplicate backups.

## Usage

```bash
node s3-cleanup-tools/start-cleanup.js <folder>
```

**Examples:**

```bash
node s3-cleanup-tools/start-cleanup.js prod-001
node s3-cleanup-tools/start-cleanup.js dev-002
```

## How it works

1. **Scans folder** in S3 and reads file list
2. **Groups by month** based on date in filename (format YYYY-MM-DD)
3. **Determines what to delete:**
   - Current month → keep **ALL** files
   - Past months → keep only **LAST** (newest) file
4. **Shows detailed report** with ✅ KEEP / ❌ DELETE marks
5. **Waits for confirmation** - press Enter to continue or any other key to cancel
6. **Deletes files** after confirmation

## Safety

✅ Script **doesn't delete anything** without your confirmation
✅ Shows detailed report first
✅ Current month is **never** affected
✅ At least 1 file is kept per month
✅ Can be cancelled anytime before confirmation

## Example output

```
🔍 Scanning folder: prod-001...
✅ Found 45 files

================================================================================
📊 ANALYSIS RESULTS
================================================================================

📅 Current month: 2026-01

📁 2025-12:
   Total files: 15
   Total size: 78.92 MB
   ❌ DELETE prod-001/db-backup-2025-12-01.db
   ❌ DELETE prod-001/db-backup-2025-12-05.db
   ✅ KEEP   prod-001/db-backup-2025-12-31.db (newest)
   ...

🔵 2026-01 (CURRENT):
   Total files: 20
   Total size: 105.67 MB
   ✅ KEEP   prod-001/db-backup-2026-01-01.db
   ✅ KEEP   prod-001/db-backup-2026-01-05.db
   ✅ KEEP   prod-001/db-backup-2026-01-10.db
   ✅ KEEP   prod-001/db-backup-2026-01-28.db (newest)
   ...

================================================================================
📝 SUMMARY
================================================================================
✅ Files to keep:   23
❌ Files to delete: 22
💾 Space to free:   115.34 MB
================================================================================

⚠️  WARNING: You are about to DELETE files from S3!
⚠️  This action CANNOT be undone!

Press ENTER to proceed with deletion
Press ANY OTHER KEY to cancel
```

## Configuration

Script uses settings from `env.js`:

```javascript
export const S3_CONFIG = {
  REGION: 'eu-north-1',
  BUCKET_NAME: 'your-bucket-name',
  ACCESS_KEY_ID: 'your-access-key',
  SECRET_ACCESS_KEY: 'your-secret-key',
};
```

## Requirements

- Node.js 16+
- Configured `env.js` with valid AWS credentials
- IAM permissions: `s3:ListBucket`, `s3:DeleteObject`
- Package `@aws-sdk/client-s3` (already installed in project)

## Errors

| Error | Solution |
|-------|----------|
| `Missing required parameter` | Specify folder: `node start-cleanup.js prod-001` |
| `Access Denied` | Check credentials and IAM permissions in env.js |
| `Cannot parse date` | File must contain date in YYYY-MM-DD format |
