import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getConnection } from './db/db.js';
import { DB_ENV, DB_NAME, DB_VERSION, S3_CONFIG } from './env.js';

const s3Client = new S3Client({
  region: S3_CONFIG.REGION,
  credentials: {
    accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
  },
});

export async function performBackup() {
  console.log('Starting S3 backup process...');
  console.time('S3 backup completed in');

  try {
    await fs.mkdir(S3_CONFIG.TEMP_DIR, { recursive: true });
    const backupFile = await createDbBackup();
    await uploadDbBackupToS3(backupFile);
    await cleanupTempFile(backupFile);

    console.timeEnd('S3 backup completed in');
  } catch (error) {
    console.error('Daily S3 backup failed:', error);
  }
}

async function createDbBackup() {
  const dateISO = new Date().toISOString().split('T')[0];
  const backupFileName = `${DB_NAME}-${DB_ENV}-${DB_VERSION}-${dateISO}.db`;
  const backupPath = path.join(S3_CONFIG.TEMP_DIR, backupFileName);

  console.log(`Creating database backup: ${backupFileName}`);

  try {
    await fs.unlink(backupPath);
    console.log(`Removed existing backup file: ${backupFileName}`);
  } catch (error) {}

  const connection = await getConnection();
  try {
    await connection.exec(`VACUUM INTO '${backupPath}'`);
    console.log(`Database backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Error creating database backup:', error);
    throw error;
  }
}

async function uploadDbBackupToS3(filePath) {
  const fileName = path.basename(filePath);
  const s3Key = `${DB_ENV}-${DB_VERSION}/${fileName}`;

  console.log(`Uploading to S3: ${s3Key}`);

  const fileStream = createReadStream(filePath);
  const fileStats = await fs.stat(filePath);

  const uploadParams = {
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: s3Key,
    Body: fileStream,
    ContentType: 'application/x-sqlite3',
    StorageClass: 'STANDARD_IA',
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`Successfully uploaded to S3: ${s3Key} (${(fileStats.size / 1024 / 1024).toFixed(2)}MB)`);
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}

async function cleanupTempFile(file) {
  try {
    await fs.unlink(file);
    console.log(`Cleaned up local file: ${path.basename(file)}`);
  } catch (error) {
    console.error(`Error cleaning up file ${file}:`, error);
  }
}
