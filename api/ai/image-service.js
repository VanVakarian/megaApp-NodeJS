import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import {
  AI_IMAGE_GEN_PROMPT,
  AI_PROVIDERS,
  IMAGE_GEN_QUEUE_MAX_ATTEMPTS,
  IMAGE_GEN_QUEUE_MAX_CONCURRENT,
  IMAGE_GEN_QUEUE_POLL_INTERVAL_MS,
  IMAGE_GEN_QUEUE_RATE_LIMIT_MS,
} from '../../env.js';
import { broadcastToAllUsers } from '../ws/ws-setup.js';
import * as aiService from './ai-service.js';
import * as imageCache from './image-cache.js';

const AI_IMAGE_GEN_MODEL = AI_PROVIDERS.IMAGE_GENERATION_NAGA.MODELS[0];

class ImageGenerationQueue {
  constructor(options = {}) {
    this.queue = new Map();
    this.maxConcurrent = options.maxConcurrent || 10;
    this.rateLimitMs = options.rateLimitMs || 1000;
    this.maxAttempts = options.maxAttempts || 5;
    this.pollIntervalMs = options.pollIntervalMs || 100;
    this.lastGenerationTime = 0;
    this.processingCount = 0;
    this.processingInterval = null;
  }

  enqueue(catalogueId, productName, description) {
    if (this.queue.has(catalogueId)) {
      return { success: false, reason: 'Already in queue' };
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

    if (timeSinceLastGen < this.rateLimitMs) {
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

    if (task.attempts >= this.maxAttempts) {
      console.error(
        `❌ Giving up on image generation for product ${task.catalogueId} after ${this.maxAttempts} attempts`
      );
      this.queue.delete(task.catalogueId);
      return;
    }

    const delayMs = Math.pow(2, task.attempts - 1) * 1000;
    task.status = 'pending';
    task.availableAt = Date.now() + delayMs;

    console.log(
      `🔄 Retrying image generation for product ${task.catalogueId} in ${delayMs}ms (attempt ${task.attempts}): ${error}`
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

  getStats() {
    const pending = Array.from(this.queue.values()).filter((t) => t.status === 'pending').length;

    return {
      total: this.queue.size,
      pending,
      processing: this.processingCount,
      isRunning: this.processingInterval !== null,
    };
  }
}

const imageQueue = new ImageGenerationQueue({
  maxConcurrent: IMAGE_GEN_QUEUE_MAX_CONCURRENT,
  rateLimitMs: IMAGE_GEN_QUEUE_RATE_LIMIT_MS,
  maxAttempts: IMAGE_GEN_QUEUE_MAX_ATTEMPTS,
  pollIntervalMs: IMAGE_GEN_QUEUE_POLL_INTERVAL_MS,
});

export function requestProductImageGeneration(catalogueId, productName, description = '') {
  if (imageCache.hasImage(catalogueId)) {
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

    const prompt = AI_IMAGE_GEN_PROMPT.replace('{productName}', productName).replace(
      '{foodDescription}',
      productDescription || ''
    );

    console.log(`📝 Prompt: "${prompt}"`);
    console.log(`🤖 Model: ${AI_IMAGE_GEN_MODEL}`);

    const startTime = Date.now();
    const imageResult = await aiService.generateImageNaga(prompt);
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
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
      console.log(`📁 Created images directory: ${imagesDir}`);
    }

    const originalFilename = `${catalogueId}-original.${imageResult.data.format}`;
    const originalFilePath = join(imagesDir, originalFilename);
    const thumbFilename = `${catalogueId}-thumb.webp`;
    const thumbFilePath = join(imagesDir, thumbFilename);

    writeFileSync(originalFilePath, imageResult.data.imageBuffer);
    console.log(`💾 Original image saved: ${originalFilename}`);

    const thumbStartTime = Date.now();
    await sharp(imageResult.data.imageBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(thumbFilePath);
    const thumbTime = Date.now() - thumbStartTime;
    console.log(`🖼️  Thumbnail created in ${thumbTime}ms: ${thumbFilename}`);

    imageCache.setImageExists(catalogueId);
    console.log(`💾 Image cache updated for product ${catalogueId}`);

    broadcastToAllUsers({
      type: 'CATALOGUE_IMAGE_GENERATED',
      payload: { catalogueId },
    });
    console.log(`📡 Broadcasted CATALOGUE_IMAGE_GENERATED event for product ${catalogueId}`);

    return {
      success: true,
      data: {
        catalogueId,
        thumbnailFilename: thumbFilename,
        originalFilename,
        generationTime,
        thumbTime,
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
