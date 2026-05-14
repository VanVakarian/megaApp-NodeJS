# S3-Compatible Backup Cleanup Utility

Utility for automatic cleanup of old zip backups stored in AWS S3 or Backblaze B2. Keeps one file per past month, removes duplicate backups.

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

1. **Scans folder** in the active storage and reads file list
2. **Groups by month** based on object `LastModified`
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
   ❌ DELETE prod-001/megaapp-prod-001-2025-12-01T02-00-00.000Z.zip
   ❌ DELETE prod-001/megaapp-prod-001-2025-12-05T02-00-00.000Z.zip
   ✅ KEEP   prod-001/megaapp-prod-001-2025-12-31T02-00-00.000Z.zip (newest)
   ...

🔵 2026-01 (CURRENT):
   Total files: 20
   Total size: 105.67 MB
   ✅ KEEP   prod-001/megaapp-prod-001-2026-01-01T02-00-00.000Z.zip
   ✅ KEEP   prod-001/megaapp-prod-001-2026-01-05T02-00-00.000Z.zip
   ✅ KEEP   prod-001/megaapp-prod-001-2026-01-10T02-00-00.000Z.zip
   ✅ KEEP   prod-001/megaapp-prod-001-2026-01-28T02-00-00.000Z.zip (newest)
   ...

================================================================================
📝 SUMMARY
================================================================================
✅ Files to keep:   23
❌ Files to delete: 22
💾 Space to free:   115.34 MB
================================================================================

⚠️  WARNING: You are about to DELETE files from backup storage!
⚠️  This action CANNOT be undone!

Press ENTER to proceed with deletion
Press ANY OTHER KEY to cancel
```

## Configuration

Script uses settings from `env.js`:

```javascript
export const BACKUP_STORAGE_PROVIDER = {
  AWS: 'aws',
  BACKBLAZE: 'backblaze',
};

export const S3_CONFIG = {
  PROVIDER: BACKUP_STORAGE_PROVIDER.BACKBLAZE,
  AWS: {
    REGION: 'eu-north-1',
    BUCKET_NAME: 'your-aws-bucket-name',
    ENDPOINT: null,
    FORCE_PATH_STYLE: false,
    STORAGE_CLASS: 'STANDARD_IA',
    ACCESS_KEY_ID: 'your-aws-access-key',
    SECRET_ACCESS_KEY: 'your-aws-secret-key',
  },
  BACKBLAZE: {
    REGION: 'eu-central-003',
    BUCKET_NAME: 'your-backblaze-bucket-name',
    ENDPOINT: 'https://s3.eu-central-003.backblazeb2.com',
    FORCE_PATH_STYLE: false,
    STORAGE_CLASS: null,
    ACCESS_KEY_ID: 'your-backblaze-access-key',
    SECRET_ACCESS_KEY: 'your-backblaze-secret-key',
  },
};
```

## Requirements

- Node.js 16+
- Configured `env.js` with a valid active storage profile
- Credentials with `ListBucket` and `DeleteObject` access for the active provider
- Package `@aws-sdk/client-s3` (already installed in project)

## Errors

| Error | Solution |
|-------|----------|
| `Missing required parameter` | Specify folder: `node start-cleanup.js prod-001` |
| `Access Denied` | Check active provider credentials and bucket permissions in env.js |
| `Missing LastModified` | Check object metadata returned by the active storage provider |
