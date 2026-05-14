import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import readline from 'readline';
import { buildBackupStorageClient, getActiveBackupStorageConfig, getBackupStorageLabel } from '../backup-storage.js';

const storageConfig = getActiveBackupStorageConfig();
const storageLabel = getBackupStorageLabel();
const s3Client = buildBackupStorageClient();

function getMonthKey(date) {
  if (!date || isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function groupFilesByMonth(files) {
  const grouped = new Map();

  for (const file of files) {
    const date = file.LastModified;
    if (!date) {
      console.warn(`⚠️  Missing LastModified for file: ${file.Key}`);
      continue;
    }

    const monthKey = getMonthKey(date);
    if (!monthKey) continue;

    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, []);
    }

    grouped.get(monthKey).push({
      key: file.Key,
      date: date,
      size: file.Size,
      lastModified: file.LastModified,
    });
  }

  for (const [month, files] of grouped.entries()) {
    files.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  return grouped;
}

function determineFilesToDelete(groupedFiles) {
  const currentMonth = getMonthKey(new Date());
  const toDelete = [];
  const toKeep = [];

  for (const [month, files] of groupedFiles.entries()) {
    if (month === currentMonth) {
      toKeep.push(...files);
      continue;
    }

    if (files.length > 0) {
      toKeep.push(files[files.length - 1]);

      if (files.length > 1) {
        toDelete.push(...files.slice(0, -1));
      }
    }
  }

  return { toDelete, toKeep };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function displayAnalysisResults(grouped, toDelete, toKeep) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ANALYSIS RESULTS');
  console.log('='.repeat(80) + '\n');

  const months = Array.from(grouped.keys()).sort();
  const currentMonth = getMonthKey(new Date());

  console.log(`📅 Current month: ${currentMonth}\n`);

  for (const month of months) {
    const files = grouped.get(month);
    const isCurrent = month === currentMonth;
    const monthLabel = isCurrent ? `${month} (CURRENT)` : month;

    console.log(`\n${isCurrent ? '🔵' : '📁'} ${monthLabel}:`);
    console.log(`   Total files: ${files.length}`);

    if (files.length > 0) {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      console.log(`   Total size: ${formatBytes(totalSize)}`);

      files.forEach((file, idx) => {
        const willDelete = toDelete.some((f) => f.key === file.key);
        const willKeep = toKeep.some((f) => f.key === file.key);
        const status = willDelete ? '❌ DELETE' : willKeep ? '✅ KEEP' : '❓';
        const label = idx === files.length - 1 ? ' (newest)' : '';

        console.log(`   ${status} ${file.key}${label}`);
        console.log(`        Date: ${file.date.toISOString()}, Size: ${formatBytes(file.size)}`);
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📝 SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Files to keep:   ${toKeep.length}`);
  console.log(`❌ Files to delete: ${toDelete.length}`);

  if (toDelete.length > 0) {
    const totalDeleteSize = toDelete.reduce((sum, f) => sum + f.size, 0);
    console.log(`💾 Space to free:   ${formatBytes(totalDeleteSize)}`);
  }

  console.log('='.repeat(80) + '\n');
}

async function listAllFiles(folder) {
  const allFiles = [];
  let continuationToken = undefined;

  console.log(`🔍 Scanning folder: ${folder}...`);

  do {
    const command = new ListObjectsV2Command({
      Bucket: storageConfig.BUCKET_NAME,
      Prefix: folder.endsWith('/') ? folder : `${folder}/`,
      ContinuationToken: continuationToken,
    });

    try {
      const response = await s3Client.send(command);

      if (response.Contents) {
        allFiles.push(...response.Contents);
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } catch (error) {
      console.error('❌ Error listing objects:', error);
      throw error;
    }
  } while (continuationToken);

  console.log(`✅ Found ${allFiles.length} files\n`);
  return allFiles;
}

async function waitForConfirmation() {
  return new Promise((resolve) => {
    console.log('⚠️  WARNING: You are about to DELETE files from backup storage!');
    console.log('⚠️  This action CANNOT be undone!');
    console.log('\nPress ENTER to proceed with deletion');
    console.log('Press ANY OTHER KEY to cancel\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const handleKeypress = (str, key) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      process.stdin.removeListener('keypress', handleKeypress);
      rl.close();

      if (key && key.name === 'return') {
        resolve(true);
      } else {
        resolve(false);
      }
    };

    process.stdin.on('keypress', handleKeypress);
  });
}

async function deleteFiles(filesToDelete) {
  console.log('\n🗑️  Starting deletion process...\n');

  const BATCH_SIZE = 1000;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
    const batch = filesToDelete.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(filesToDelete.length / BATCH_SIZE);

    if (totalBatches > 1) {
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} files)...\n`);
    }

    try {
      const command = new DeleteObjectsCommand({
        Bucket: storageConfig.BUCKET_NAME,
        Delete: {
          Objects: batch.map((file) => ({ Key: file.key })),
          Quiet: false,
        },
      });

      const response = await s3Client.send(command);

      if (response.Deleted) {
        response.Deleted.forEach((deleted) => {
          console.log(`✅ Deleted: ${deleted.Key}`);
          successCount++;
        });
      }

      if (response.Errors) {
        response.Errors.forEach((error) => {
          console.error(`❌ Failed to delete ${error.Key}: ${error.Code} - ${error.Message}`);
          failCount++;
        });
      }
    } catch (error) {
      console.error(`❌ Batch deletion failed:`, error.message);
      failCount += batch.length;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏁 DELETION COMPLETE');
  console.log('='.repeat(80));
  console.log(`✅ Successfully deleted: ${successCount}`);
  console.log(`❌ Failed to delete:     ${failCount}`);
  console.log('='.repeat(80) + '\n');
}

async function main() {
  try {
    const folder = process.argv[2];

    if (!folder) {
      console.error('❌ Error: Missing required parameter');
      console.error('\nUsage: node start-cleanup.js <folder>');
      console.error('\nExample: node start-cleanup.js prod-001');
      process.exit(1);
    }

    console.log('🚀 S3-COMPATIBLE BACKUP CLEANUP UTILITY');
    console.log(`\n🧩 Provider: ${storageLabel}`);
    console.log(`📦 Bucket: ${storageConfig.BUCKET_NAME}`);
    console.log(`📁 Folder: ${folder}`);
    console.log(`🌍 Region: ${storageConfig.REGION}\n`);

    const files = await listAllFiles(folder);

    if (files.length === 0) {
      console.log('ℹ️  No files found in this folder. Nothing to clean up.');
      process.exit(0);
    }

    const grouped = groupFilesByMonth(files);
    const { toDelete, toKeep } = determineFilesToDelete(grouped);

    displayAnalysisResults(grouped, toDelete, toKeep);

    if (toDelete.length === 0) {
      console.log('✨ No files to delete. Everything is already clean!');
      process.exit(0);
    }

    const confirmed = await waitForConfirmation();

    if (!confirmed) {
      console.log('\n❌ Operation cancelled by user. No files were deleted.');
      process.exit(0);
    }

    console.log('\n✅ Confirmation received. Proceeding with deletion...');
    await deleteFiles(toDelete);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
