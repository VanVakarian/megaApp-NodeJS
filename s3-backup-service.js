import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getConnection } from './db/db.js';
import {
  DB_FILE_NAME,
  DO_S3_BACKUP,
  S3_BACKUP_ACCESS_KEY_ID,
  S3_BACKUP_BUCKET_NAME,
  S3_BACKUP_REGION,
  S3_BACKUP_SECRET_ACCESS_KEY,
  S3_BACKUP_TEMP_DIR,
} from './env.js';

const s3Client = new S3Client({
  region: S3_BACKUP_REGION,
  credentials: {
    accessKeyId: S3_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: S3_BACKUP_SECRET_ACCESS_KEY,
  },
});

export async function performBackup() {
  if (!DO_S3_BACKUP) {
    console.log('S3 backup is disabled');
    return;
  }

  console.log('Starting S3 backup process...');
  console.time('S3 backup completed in');

  try {
    await fs.mkdir(S3_BACKUP_TEMP_DIR, { recursive: true });
    const backupFile = await createDatabaseBackup();
    await uploadToS3(backupFile);
    await cleanupLocalFiles([backupFile]);

    console.timeEnd('S3 backup completed in');
  } catch (error) {
    throw error;
  }
}

async function createDatabaseBackup() {
  const currentDate = new Date().toISOString().split('T')[0];
  const baseName = DB_FILE_NAME.replace('.db', '');
  const backupFileName = `${baseName}-${currentDate}.db`;
  const backupPath = path.join(S3_BACKUP_TEMP_DIR, backupFileName);

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
  } finally {
    await connection.close();
  }
}

async function uploadToS3(filePath) {
  const fileName = path.basename(filePath);

  console.log(`Uploading to S3: ${fileName}`);

  const fileStream = createReadStream(filePath);
  const fileStats = await fs.stat(filePath);

  const uploadParams = {
    Bucket: S3_BACKUP_BUCKET_NAME,
    Key: fileName,
    Body: fileStream,
    ContentType: 'application/x-sqlite3',
    StorageClass: 'STANDARD_IA',
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`Successfully uploaded to S3: ${fileName} (${(fileStats.size / 1024 / 1024).toFixed(2)}MB)`);
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}

async function cleanupLocalFiles(files) {
  for (const file of files) {
    try {
      await fs.unlink(file);
      console.log(`Cleaned up local file: ${path.basename(file)}`);
    } catch (error) {
      console.error(`Error cleaning up file ${file}:`, error);
    }
  }
}
