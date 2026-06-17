import { S3Client } from '@aws-sdk/client-s3';
import { BACKUP_STORAGE_PROVIDER, S3_CONFIG } from './env.js';

export function getActiveBackupStorageConfig() {
  switch (S3_CONFIG.PROVIDER) {
    case BACKUP_STORAGE_PROVIDER.AWS:
      return {
        PROVIDER: BACKUP_STORAGE_PROVIDER.AWS,
        TEMP_DIR: S3_CONFIG.TEMP_DIR,
        ...S3_CONFIG.AWS,
      };
    case BACKUP_STORAGE_PROVIDER.BACKBLAZE:
      return {
        PROVIDER: BACKUP_STORAGE_PROVIDER.BACKBLAZE,
        TEMP_DIR: S3_CONFIG.TEMP_DIR,
        ...S3_CONFIG.BACKBLAZE,
      };
    default:
      throw new Error(`Unsupported backup storage provider: ${S3_CONFIG.PROVIDER}`);
  }
}

export function buildBackupStorageClient() {
  const storageConfig = getActiveBackupStorageConfig();

  return new S3Client({
    region: storageConfig.REGION,
    endpoint: storageConfig.ENDPOINT ?? undefined,
    forcePathStyle: storageConfig.FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: storageConfig.ACCESS_KEY_ID,
      secretAccessKey: storageConfig.SECRET_ACCESS_KEY,
    },
  });
}

export function getBackupStorageLabel() {
  const storageConfig = getActiveBackupStorageConfig();

  if (storageConfig.PROVIDER === BACKUP_STORAGE_PROVIDER.BACKBLAZE) {
    return 'Backblaze B2';
  }

  return 'AWS S3';
}
