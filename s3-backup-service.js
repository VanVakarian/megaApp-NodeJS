import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import { crc32, deflateRawSync } from 'node:zlib';
import path from 'path';
import { buildBackupStorageClient, getActiveBackupStorageConfig, getBackupStorageLabel } from './backup-storage.js';
import { getConnection } from './db/db.js';
import { DB_ENV, DB_NAME, DB_VERSION } from './env.js';

const escapeSqliteString = (value) => value.replaceAll("'", "''");
const buildTimestamp = () => new Date().toISOString().replaceAll(':', '-');
const buildArchiveBaseName = (timestamp) => `${DB_NAME}-${DB_ENV}-${DB_VERSION}-${timestamp}`;

export async function performBackup() {
  const storageConfig = getActiveBackupStorageConfig();
  const storageLabel = getBackupStorageLabel();
  const timestamp = buildTimestamp();
  const archiveBaseName = buildArchiveBaseName(timestamp);
  const snapshotPath = path.join(storageConfig.TEMP_DIR, `${archiveBaseName}.snapshot.db`);
  const archivePath = path.join(storageConfig.TEMP_DIR, `${archiveBaseName}.zip`);

  console.log(`Starting ${storageLabel} backup process...`);
  console.time('Backup completed in');

  try {
    await ensureTempDirectory();
    await cleanupLocalFiles([snapshotPath, archivePath]);
    await createSnapshot(snapshotPath);
    await createZipArchive(snapshotPath, archivePath);
    await uploadArchiveToStorage(archivePath);

    console.timeEnd('Backup completed in');
  } catch (error) {
    console.error(`Daily ${storageLabel} backup failed:`, error);
  } finally {
    await cleanupLocalFiles([snapshotPath, archivePath]);
  }
}

async function ensureTempDirectory() {
  const storageConfig = getActiveBackupStorageConfig();
  await fs.mkdir(storageConfig.TEMP_DIR, { recursive: true });
}

async function createSnapshot(snapshotPath) {
  console.log(`Creating database snapshot: ${path.basename(snapshotPath)}`);

  const connection = await getConnection();
  try {
    await connection.exec(`VACUUM INTO '${escapeSqliteString(snapshotPath)}'`);
    console.log(`Database snapshot created: ${snapshotPath}`);
  } catch (error) {
    console.error('Error creating database snapshot:', error);
    throw error;
  }
}

async function createZipArchive(snapshotPath, archivePath) {
  const fileName = path.basename(snapshotPath);
  const fileData = await fs.readFile(snapshotPath);
  const compressed = deflateRawSync(fileData);
  const crc = crc32(fileData);

  const now = new Date();
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const nameBuffer = Buffer.from(fileName, 'utf8');

  const localHeader = Buffer.allocUnsafe(30 + nameBuffer.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(fileData.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBuffer.copy(localHeader, 30);

  const centralDirOffset = localHeader.length + compressed.length;

  const centralHeader = Buffer.allocUnsafe(46 + nameBuffer.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(fileData.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);
  nameBuffer.copy(centralHeader, 46);

  const endRecord = Buffer.allocUnsafe(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralHeader.length, 12);
  endRecord.writeUInt32LE(centralDirOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  await fs.writeFile(archivePath, Buffer.concat([localHeader, compressed, centralHeader, endRecord]));
  console.log(`Database archive created: ${archivePath}`);
}

async function uploadArchiveToStorage(archivePath) {
  const storageConfig = getActiveBackupStorageConfig();
  const storageLabel = getBackupStorageLabel();
  const archiveFileName = path.basename(archivePath);
  const s3Key = `${DB_ENV}-${DB_VERSION}/${archiveFileName}`;

  console.log(`Uploading to ${storageLabel}: ${s3Key}`);

  const fileStream = createReadStream(archivePath);
  const fileStats = await fs.stat(archivePath);

  const uploadParams = {
    Bucket: storageConfig.BUCKET_NAME,
    Key: s3Key,
    Body: fileStream,
    ContentType: 'application/zip',
  };

  if (storageConfig.STORAGE_CLASS) {
    uploadParams.StorageClass = storageConfig.STORAGE_CLASS;
  }

  try {
    await buildBackupStorageClient().send(new PutObjectCommand(uploadParams));
    console.log(`Successfully uploaded to ${storageLabel}: ${s3Key} (${(fileStats.size / 1024 / 1024).toFixed(2)}MB)`);
  } catch (error) {
    console.error(`Error uploading to ${storageLabel}:`, error);
    throw error;
  }
}

async function cleanupLocalFiles(pathsToDelete) {
  for (const filePath of pathsToDelete) {
    try {
      await fs.unlink(filePath);
      console.log(`Cleaned up local file: ${path.basename(filePath)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error cleaning up file ${filePath}:`, error);
      }
    }
  }
}
