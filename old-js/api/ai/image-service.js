import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import {
  AI_IMAGE_GENERATION,
  AI_PROVIDERS,
  IMAGE_GEN_QUEUE_ERROR_BACKOFF_BASE_SEC,
  IMAGE_GEN_QUEUE_ERROR_BACKOFF_INCREMENT_SEC,
  IMAGE_GEN_QUEUE_ERROR_BACKOFF_MAX_SEC,
  IMAGE_GEN_QUEUE_MAX_ATTEMPTS,
  IMAGE_GEN_QUEUE_MAX_CONCURRENT,
  IMAGE_GEN_QUEUE_MAX_SIZE,
  IMAGE_GEN_QUEUE_POLL_INTERVAL_MS,
  IMAGE_GEN_QUEUE_RATE_LIMIT_SEC,
} from '../../env.js';
import { broadcastToAllUsers } from '../ws/ws-setup.js';
import * as aiService from './ai-service.js';
import * as imageCache from './image-cache.js';

function getImageGenerationProvider() {
  const providers = AI_PROVIDERS.IMAGE_GENERATION;
  if (!providers || providers.length === 0) return null;

  const activeProvider = providers.find((p) => p.ENABLED && p.MODELS && p.MODELS.length > 0);
  return activeProvider || null;
}

class ImageGenerationQueue {
  constructor(options = {}) {
    this.queue = new Map();
    this.maxConcurrent = options.maxConcurrent || 10;
    this.maxSize = options.maxSize || 24;
    this.rateLimitSec = options.rateLimitSec || 1;
    this.maxAttempts = options.maxAttempts || 5;
    this.pollIntervalMs = options.pollIntervalMs || 100;
    this.lastGenerationTime = 0;
    this.processingCount = 0;
    this.processingInterval = null;
    this.errorBackoffBaseSec = options.errorBackoffBaseSec || 1;
    this.errorBackoffIncrementSec = options.errorBackoffIncrementSec || 5;
    this.errorBackoffMaxSec = options.errorBackoffMaxSec || 3600;
    this.currentErrorBackoffSec = 0;
  }

  enqueue(catalogueId, productName, description) {
    if (this.queue.has(catalogueId)) {
      return { success: false, reason: 'Already in queue' };
    }

    if (this.queue.size >= this.maxSize) {
      return { success: false, reason: `Queue is full (max ${this.maxSize} items)` };
    }

    this.queue.set(catalogueId, {
      catalogueId,
      productName,
      description,
      status: 'pending',
      availableAt: Date.now(),
      attempts: 0,
      addedAt: Date.now(),
    });

    this.ensureStarted();

    return { success: true };
  }

  ensureStarted() {
    if (!this.processingInterval) {
      console.log('🚀 Starting image generation queue');
      this.processingInterval = setInterval(() => this.processQueue(), this.pollIntervalMs);
    }
  }

  async processQueue() {
    if (this.processingCount >= this.maxConcurrent) {
      return;
    }

    const now = Date.now();
    const timeSinceLastGen = now - this.lastGenerationTime;
    const effectiveRateLimit = Math.max(this.rateLimitSec * 1000, this.currentErrorBackoffSec * 1000);

    if (timeSinceLastGen < effectiveRateLimit) {
      return;
    }

    const task = this.findNextTask(now);

    if (!task) {
      if (this.queue.size === 0 && this.processingCount === 0) {
        console.log('🛑 Queue empty, stopping image generation queue');
        this.stop();
      }
      return;
    }

    task.status = 'processing';
    this.processingCount++;
    this.lastGenerationTime = now;

    this.executeTask(task);
  }

  findNextTask(now) {
    for (const task of this.queue.values()) {
      if (task.status === 'pending' && task.availableAt <= now) {
        return task;
      }
    }
    return null;
  }

  async executeTask(task) {
    try {
      const result = await generateProductImageInternal(task.catalogueId, task.productName, task.description);

      if (result.success) {
        this.queue.delete(task.catalogueId);
        this.processingCount--;
        this.resetErrorBackoff();
      } else {
        this.handleFailedTask(task, result.error);
      }
    } catch (error) {
      this.handleFailedTask(task, error.message);
    }
  }

  handleFailedTask(task, error) {
    task.attempts++;
    this.processingCount--;
    this.increaseErrorBackoff();

    if (task.attempts >= this.maxAttempts) {
      console.error(
        `❌ Giving up on image generation for product ${task.catalogueId} after ${this.maxAttempts} attempts. Global backoff: ${this.currentErrorBackoffSec}s`
      );
      this.queue.delete(task.catalogueId);
      return;
    }

    const delayMs = Math.pow(2, task.attempts - 1) * 1000;
    task.status = 'pending';
    task.availableAt = Date.now() + delayMs;

    console.log(
      `🔄 Retrying image generation for product ${task.catalogueId} in ${delayMs}ms (attempt ${task.attempts}). Global backoff: ${this.currentErrorBackoffSec}s. Error: ${error}`
    );
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  has(catalogueId) {
    return this.queue.has(catalogueId);
  }

  increaseErrorBackoff() {
    this.currentErrorBackoffSec = Math.min(
      this.currentErrorBackoffSec + this.errorBackoffIncrementSec,
      this.errorBackoffMaxSec
    );
    console.log(`⏱️  Error backoff increased to ${this.currentErrorBackoffSec}s`);
  }

  resetErrorBackoff() {
    if (this.currentErrorBackoffSec > 0) {
      console.log(`✅ Error backoff reset from ${this.currentErrorBackoffSec}s to 0s`);
      this.currentErrorBackoffSec = 0;
    }
  }

  getStats() {
    const pending = Array.from(this.queue.values()).filter((t) => t.status === 'pending').length;

    return {
      total: this.queue.size,
      pending,
      processing: this.processingCount,
      isRunning: this.processingInterval !== null,
      currentErrorBackoffSec: this.currentErrorBackoffSec,
    };
  }
}

const imageQueue = new ImageGenerationQueue({
  maxConcurrent: IMAGE_GEN_QUEUE_MAX_CONCURRENT,
  maxSize: IMAGE_GEN_QUEUE_MAX_SIZE,
  rateLimitSec: IMAGE_GEN_QUEUE_RATE_LIMIT_SEC,
  maxAttempts: IMAGE_GEN_QUEUE_MAX_ATTEMPTS,
  pollIntervalMs: IMAGE_GEN_QUEUE_POLL_INTERVAL_MS,
  errorBackoffBaseSec: IMAGE_GEN_QUEUE_ERROR_BACKOFF_BASE_SEC,
  errorBackoffIncrementSec: IMAGE_GEN_QUEUE_ERROR_BACKOFF_INCREMENT_SEC,
  errorBackoffMaxSec: IMAGE_GEN_QUEUE_ERROR_BACKOFF_MAX_SEC,
});

export function requestProductImageGeneration(catalogueId, productName, description = '') {
  if (!getImageGenerationProvider()) {
    return { success: false, reason: 'Image generation is disabled (no active providers)' };
  }

  if (imageCache.getImageVersion(catalogueId)) {
    return { success: false, reason: 'Image already exists' };
  }

  if (imageQueue.has(catalogueId)) {
    return { success: false, reason: 'Already in queue' };
  }

  return imageQueue.enqueue(catalogueId, productName, description);
}

async function generateProductImageInternal(catalogueId, productName, productDescription = '') {
  try {
    const provider = getImageGenerationProvider();
    if (!provider) {
      console.log(`❌ Image generation is disabled for product ${catalogueId} (no active providers)`);
      return {
        success: false,
        error: 'Image generation is disabled (no active providers)',
      };
    }

    console.log(`🎨 Starting image generation for product ${catalogueId}: "${productName}"`);

    const partialPrompt = AI_IMAGE_GENERATION.FOOD_PRODUCT_PROMPT.replace('{productName}', productName || '');
    const finalPrompt = partialPrompt.replace('{foodDescription}', productDescription || '');

    console.log(`📝 Prompt: "${finalPrompt}"`);
    console.log(`🤖 Provider: ${provider.PROVIDER}, Model: ${provider.MODELS[0]}`);

    const startTime = Date.now();
    const imageResult = await aiService.generateImage(finalPrompt);
    const generationTime = Date.now() - startTime;

    if (!imageResult.success) {
      console.log(`❌ Image generation failed for product ${catalogueId}: ${imageResult.error}`);
      return {
        success: false,
        error: imageResult.error,
      };
    }

    console.log(`✅ Image generated successfully in ${generationTime}ms`);

    const imagesDir = join(process.cwd(), 'public', 'images', 'food');
    const origDir = join(imagesDir, 'orig');
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
      console.log(`📁 Created images directory: ${imagesDir}`);
    }
    if (!existsSync(origDir)) {
      mkdirSync(origDir, { recursive: true });
      console.log(`📁 Created orig directory: ${origDir}`);
    }

    const currentVersion = imageCache.getImageVersion(catalogueId) || 0;
    const newVersion = currentVersion + 1;

    const originalFilename = `${catalogueId}-original-v${newVersion}.${imageResult.data.format}`;
    const originalFilePath = join(origDir, originalFilename);

    writeFileSync(originalFilePath, imageResult.data.imageBuffer);
    console.log(`💾 Original image saved: ${originalFilename}`);

    const variantResults = await generateImageVariants(
      imageResult.data.imageBuffer,
      catalogueId,
      newVersion,
      imagesDir
    );

    imageCache.setImageExists(catalogueId, newVersion);
    console.log(`💾 Image cache updated for product ${catalogueId} (version ${newVersion})`);

    broadcastToAllUsers({
      type: 'CATALOGUE_IMAGE_GENERATED',
      payload: { catalogueId, imageVersion: newVersion },
    });
    console.log(`📡 Broadcasted CATALOGUE_IMAGE_GENERATED event for product ${catalogueId} (version ${newVersion})`);

    return {
      success: true,
      data: {
        catalogueId,
        thumbnailFilename: variantResults.thumbFilename,
        originalFilename,
        mediumFilename: variantResults.mediumFilename,
        largeFilename: variantResults.largeFilename,
        squircleFilename: variantResults.squircleFilename,
        cornerFilename: variantResults.cornerFilename,
        generationTime,
        thumbTime: variantResults.thumbTime,
        mediumTime: variantResults.mediumTime,
        largeTime: variantResults.largeTime,
        squircleTime: variantResults.squircleTime,
        cornerTime: variantResults.cornerTime,
      },
    };
  } catch (error) {
    console.error(`❌ Image generation error for product ${catalogueId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export function stopImageQueue() {
  imageQueue.stop();
}

export function getImageQueueStats() {
  return imageQueue.getStats();
}

export async function generateProductImage(catalogueId, productName, productDescription = '') {
  return await generateProductImageInternal(catalogueId, productName, productDescription);
}

export async function regenerateImageVariantsFromOriginal(catalogueId) {
  try {
    console.log(`🔄 Regenerating all image variants for product ${catalogueId} from original`);

    const imagesDir = join(process.cwd(), 'public', 'images', 'food');
    const origDir = join(imagesDir, 'orig');

    if (!existsSync(origDir)) {
      console.log(`❌ Original images directory not found: ${origDir}`);
      return {
        success: false,
        error: 'Original images directory not found',
      };
    }

    const files = readdirSync(origDir);
    const originalFile = files.find(
      (file) =>
        file.startsWith(`${catalogueId}-original-v`) &&
        (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.webp'))
    );

    if (!originalFile) {
      console.log(`❌ Original image not found for product ${catalogueId}`);
      return {
        success: false,
        error: `Original image not found for product ${catalogueId}`,
      };
    }

    const originalFilePath = join(origDir, originalFile);
    console.log(`📂 Found original: ${originalFile}`);

    const versionMatch = originalFile.match(/-v(\d+)\./);
    const currentVersion = versionMatch ? parseInt(versionMatch[1]) : 0;
    const newVersion = currentVersion + 1;

    console.log(`📈 Version: ${currentVersion} → ${newVersion}`);

    const originalBuffer = readFileSync(originalFilePath);
    const startTime = Date.now();

    const formatMatch = originalFile.match(/\.(png|jpg|jpeg|webp)$/i);
    const originalFormat = formatMatch ? formatMatch[1] : 'png';

    const newOriginalFilename = `${catalogueId}-original-v${newVersion}.${originalFormat}`;
    const newOriginalFilePath = join(origDir, newOriginalFilename);

    deleteOldImageVersions(catalogueId, newVersion, imagesDir, origDir);

    console.log(`⚙️  Generating all variants from original...`);

    renameSync(originalFilePath, newOriginalFilePath);
    console.log(`🔄 Original image renamed: ${originalFile} → ${newOriginalFilename}`);

    const variantResults = await generateImageVariants(originalBuffer, catalogueId, newVersion, imagesDir);

    const totalTime = Date.now() - startTime;
    console.log(`✅ All variants regenerated in ${totalTime}ms`);

    imageCache.setImageExists(catalogueId, newVersion);

    broadcastToAllUsers({
      type: 'CATALOGUE_IMAGE_GENERATED',
      payload: { catalogueId, imageVersion: newVersion },
    });

    return {
      success: true,
      data: {
        catalogueId,
        version: newVersion,
        previousVersion: currentVersion,
        originalFilename: newOriginalFilename,
        thumbFilename: variantResults.thumbFilename,
        mediumFilename: variantResults.mediumFilename,
        largeFilename: variantResults.largeFilename,
        squircleFilename: variantResults.squircleFilename,
        cornerFilename: variantResults.cornerFilename,
        totalTime,
        thumbTime: variantResults.thumbTime,
        mediumTime: variantResults.mediumTime,
        largeTime: variantResults.largeTime,
        squircleTime: variantResults.squircleTime,
        cornerTime: variantResults.cornerTime,
      },
    };
  } catch (error) {
    console.error(`❌ Regeneration error for product ${catalogueId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function generateImageVariants(imageBuffer, catalogueId, newVersion, imagesDir) {
  const results = {};

  const thumbStartTime = Date.now();
  const thumbFilename = `${catalogueId}-thumb-v${newVersion}.webp`;
  await sharp(imageBuffer)
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(join(imagesDir, thumbFilename));
  results.thumbTime = Date.now() - thumbStartTime;
  results.thumbFilename = thumbFilename;
  console.log(`🖼️  Thumbnail (256x256) created in ${results.thumbTime}ms: ${thumbFilename}`);

  const mediumStartTime = Date.now();
  const mediumFilename = `${catalogueId}-medium-v${newVersion}.webp`;
  await sharp(imageBuffer)
    .resize(512, 512, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(join(imagesDir, mediumFilename));
  results.mediumTime = Date.now() - mediumStartTime;
  results.mediumFilename = mediumFilename;
  console.log(`🖼️  Medium image (512x512) created in ${results.mediumTime}ms: ${mediumFilename}`);

  const largeStartTime = Date.now();
  const largeFilename = `${catalogueId}-large-v${newVersion}.webp`;
  await sharp(imageBuffer)
    .resize(1024, 1024, { fit: 'cover' })
    .webp({ quality: 90 })
    .toFile(join(imagesDir, largeFilename));
  results.largeTime = Date.now() - largeStartTime;
  results.largeFilename = largeFilename;
  console.log(`🖼️  Large image (1024x1024) created in ${results.largeTime}ms: ${largeFilename}`);

  const squircleStartTime = Date.now();
  const squircleImageSize = 80;
  const squircleImageZoomLevel = 1.5;
  const zoomedSize = Math.round(squircleImageSize * squircleImageZoomLevel);
  const imageOffset = Math.round((zoomedSize - squircleImageSize) / 2);

  const squircleMask = createSquircleSVGMask(squircleImageSize);
  const squircleFilename = `${catalogueId}-squircle-v${newVersion}.png`;
  await sharp(imageBuffer)
    .resize(zoomedSize, zoomedSize, { fit: 'cover' })
    .extract({
      left: imageOffset,
      top: imageOffset,
      width: squircleImageSize,
      height: squircleImageSize,
    })
    .composite([{ input: squircleMask, blend: 'dest-in' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(imagesDir, squircleFilename));
  results.squircleTime = Date.now() - squircleStartTime;
  results.squircleFilename = squircleFilename;
  console.log(`🎨 Squircle thumbnail (80x80) created in ${results.squircleTime}ms: ${squircleFilename}`);

  const cornerStartTime = Date.now();
  const cornerImageSize = 370;
  const cornerImageXOffsetPercent = -25;

  const offsetPixels = Math.abs(Math.round(cornerImageSize * (cornerImageXOffsetPercent / 100)));
  const extendedWidth = cornerImageSize + offsetPixels;

  const cornerMask = createCornerBlurSVGMask(cornerImageSize);
  const resizedBuffer = await sharp(imageBuffer)
    .resize(extendedWidth, cornerImageSize, { fit: 'cover', position: 'center' })
    .toBuffer();

  const cornerFilename = `${catalogueId}-corner-v${newVersion}.png`;
  await sharp(resizedBuffer)
    .extract({
      left: offsetPixels,
      top: 0,
      width: cornerImageSize,
      height: cornerImageSize,
    })
    .composite([{ input: cornerMask, blend: 'dest-in' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(imagesDir, cornerFilename));
  results.cornerTime = Date.now() - cornerStartTime;
  results.cornerFilename = cornerFilename;
  console.log(`🎨 Corner blur image (370x370) created in ${results.cornerTime}ms: ${cornerFilename}`);

  return results;
}

function deleteOldImageVersions(catalogueId, newVersion, imagesDir, origDir) {
  console.log(`🗑️  Deleting old versions...`);

  let deletedCount = 0;

  const allFiles = readdirSync(imagesDir);
  const oldFiles = allFiles.filter(
    (file) => file.startsWith(`${catalogueId}-`) && file.match(/-v\d+\./) && !file.includes(`-v${newVersion}.`)
  );

  for (const oldFile of oldFiles) {
    try {
      unlinkSync(join(imagesDir, oldFile));
      deletedCount++;
      console.log(`   ❌ Deleted: ${oldFile}`);
    } catch (err) {
      console.warn(`   ⚠️  Could not delete ${oldFile}:`, err.message);
    }
  }

  if (deletedCount > 0) {
    console.log(`🗑️  Deleted ${deletedCount} old file(s)`);
  }

  return deletedCount;
}

function createSquircleSVGMask(size) {
  const squircleOffsetRatio = 0.06;
  const squircleCornerRatio = 0.4;
  const blurDeviation = 0.8;

  const offset = size * squircleOffsetRatio;
  const corner = size * squircleCornerRatio;
  const center = size * (1 - squircleCornerRatio);

  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur">
          <feGaussianBlur stdDeviation="${blurDeviation}"/>
        </filter>
        <mask id="squircleMask">
          <path
            d="M ${offset} ${corner}
               C ${offset} ${offset}, ${offset} ${offset}, ${corner} ${offset}
               L ${center} ${offset}
               C ${size - offset} ${offset}, ${size - offset} ${offset}, ${size - offset} ${corner}
               L ${size - offset} ${center}
               C ${size - offset} ${size - offset}, ${size - offset} ${size - offset}, ${center} ${size - offset}
               L ${corner} ${size - offset}
               C ${offset} ${size - offset}, ${offset} ${size - offset}, ${offset} ${center}
               Z"
            fill="white"
            filter="url(#blur)"
          />
        </mask>
      </defs>
      <rect width="${size}" height="${size}" fill="white" mask="url(#squircleMask)"/>
    </svg>
  `);
}

function createCornerBlurSVGMask(size) {
  const blurDeviation = 3;
  const offset = size * 0.125;
  const edgePoint = size * 0.875;

  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="cornerBlur">
          <feGaussianBlur stdDeviation="${blurDeviation}"/>
        </filter>
        <mask id="cornerMask">
          <path
            d="M ${-offset} ${-offset}
               L ${edgePoint} ${-offset}
               L ${edgePoint} 0
               C ${edgePoint} ${size * 0.8125}, ${size * 0.8125} ${edgePoint}, 0 ${edgePoint}
               L ${-offset} ${edgePoint}
               L ${-offset} ${-offset}
               Z"
            fill="white"
            filter="url(#cornerBlur)"
          />
        </mask>
      </defs>
      <rect width="${size}" height="${size}" fill="white" mask="url(#cornerMask)"/>
    </svg>
  `);
}
