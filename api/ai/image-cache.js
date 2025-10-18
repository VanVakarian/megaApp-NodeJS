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
      const thumbFiles = files.filter((file) => file.endsWith('-thumb.webp'));

      for (const file of thumbFiles) {
        const match = file.match(/^(\d+)-thumb\.webp$/);
        if (match) {
          const catalogueId = parseInt(match[1]);
          this.cache.set(catalogueId, true);
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
    return this.cache.has(catalogueId) && this.cache.get(catalogueId) === true;
  }

  set(catalogueId) {
    this.cache.set(catalogueId, true);
  }

  delete(catalogueId) {
    this.cache.delete(catalogueId);
  }

  getAll() {
    const result = {};
    for (const [id, hasImage] of this.cache.entries()) {
      result[id] = hasImage;
    }
    return result;
  }

  clear() {
    this.cache.clear();
    this.initialized = false;
  }
}

const imageCache = new ImageCache();

export function initializeImageCache() {
  imageCache.initialize();
}

export function hasImage(catalogueId) {
  return imageCache.has(catalogueId);
}

export function setImageExists(catalogueId) {
  imageCache.set(catalogueId);
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
