import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

class ImageCache {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    const imagesDir = join(process.cwd(), 'public', 'images', 'food');

    if (!existsSync(imagesDir)) {
      console.log('📁 Images directory does not exist yet, starting with empty cache');
      this.initialized = true;
      return;
    }

    try {
      const files = readdirSync(imagesDir);
      const thumbFiles = files.filter((file) => file.match(/-thumb-v\d+\.webp$/));

      for (const file of thumbFiles) {
        const match = file.match(/^(\d+)-thumb-v(\d+)\.webp$/);
        if (match) {
          const catalogueId = parseInt(match[1]);
          const version = parseInt(match[2]);

          const existing = this.cache.get(catalogueId);
          if (!existing || version > existing) {
            this.cache.set(catalogueId, version);
          }
        }
      }

      console.log(`🖼️  Image cache initialized: ${this.cache.size} images found`);
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing image cache:', error);
      this.initialized = true;
    }
  }

  has(catalogueId) {
    return this.cache.has(catalogueId);
  }

  set(catalogueId, version) {
    this.cache.set(catalogueId, version);
  }

  getVersion(catalogueId) {
    return this.cache.get(catalogueId) || null;
  }

  delete(catalogueId) {
    this.cache.delete(catalogueId);
  }

  getAll() {
    const result = {};
    for (const [id, version] of this.cache.entries()) {
      result[id] = version;
    }
    return result;
  }

  clear() {
    this.cache.clear();
    this.initialized = false;
  }
}

const imageCache = new ImageCache();

export function initImageCache() {
  imageCache.initialize();
}

export function getImageVersion(catalogueId) {
  return imageCache.getVersion(catalogueId);
}

export function setImageExists(catalogueId, version) {
  if (!version || version < 1) {
    throw new Error('Image version must be a positive integer');
  }
  imageCache.set(catalogueId, version);
}

export function removeImage(catalogueId) {
  imageCache.delete(catalogueId);
}

export function getAllImages() {
  return imageCache.getAll();
}

export function clearImageCache() {
  imageCache.clear();
}
