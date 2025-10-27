import { existsSync, mkdirSync, writeFileSync } from 'fs';
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

const AI_IMAGE_GEN_MODEL = AI_PROVIDERS.IMAGE_GENERATION_OPENROUTER.MODELS[0];

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
    console.log(`🎨 Starting image generation for product ${catalogueId}: "${productName}"`);

    const prompt = AI_IMAGE_GENERATION.FOOD_PRODUCT_PROMPT.replace('{productName}', productName).replace(
      '{foodDescription}',
      productDescription || ''
    );

    console.log(`📝 Prompt: "${prompt}"`);
    console.log(`🤖 Model: ${AI_IMAGE_GEN_MODEL}`);

    const startTime = Date.now();
    const imageResult = await aiService.generateImageWithOpenRouter(prompt);
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
    const thumbFilename = `${catalogueId}-thumb-v${newVersion}.webp`;
    const thumbFilePath = join(imagesDir, thumbFilename);
    const mediumFilename = `${catalogueId}-medium-v${newVersion}.webp`;
    const mediumFilePath = join(imagesDir, mediumFilename);
    const largeFilename = `${catalogueId}-large-v${newVersion}.webp`;
    const largeFilePath = join(imagesDir, largeFilename);

    writeFileSync(originalFilePath, imageResult.data.imageBuffer);
    console.log(`💾 Original image saved: ${originalFilename}`);

    const thumbStartTime = Date.now();
    await sharp(imageResult.data.imageBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(thumbFilePath);
    const thumbTime = Date.now() - thumbStartTime;
    console.log(`🖼️  Thumbnail (256x256) created in ${thumbTime}ms: ${thumbFilename}`);

    const mediumStartTime = Date.now();
    await sharp(imageResult.data.imageBuffer)
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(mediumFilePath);
    const mediumTime = Date.now() - mediumStartTime;
    console.log(`🖼️  Medium image (512x512) created in ${mediumTime}ms: ${mediumFilename}`);

    const largeStartTime = Date.now();
    await sharp(imageResult.data.imageBuffer)
      .resize(1024, 1024, { fit: 'cover' })
      .webp({ quality: 90 })
      .toFile(largeFilePath);
    const largeTime = Date.now() - largeStartTime;
    console.log(`🖼️  Large image (1024x1024) created in ${largeTime}ms: ${largeFilename}`);

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
        thumbnailFilename: thumbFilename,
        originalFilename,
        mediumFilename,
        largeFilename,
        generationTime,
        thumbTime,
        mediumTime,
        largeTime,
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
