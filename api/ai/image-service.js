import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import * as dbFood from '../../db/db-food.js';
import { AI_IMAGE_GEN_MODEL, AI_IMAGE_GEN_PROMPT } from '../../env.js';
import { broadcastToAllUsers } from '../ws/ws-setup.js';
import * as aiService from './ai-service.js';

const generatingImages = new Set();

export async function generateProductImage(catalogueId, productName, productDescription = '') {
  if (generatingImages.has(catalogueId)) {
    console.log(`⏭️  Image generation already in progress for product ${catalogueId}, skipping...`);
    return { success: false, error: 'Generation already in progress' };
  }

  generatingImages.add(catalogueId);

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

    const updateResult = await dbFood.updateCatalogueImageUrl(catalogueId, thumbFilename);

    if (!updateResult) {
      console.log(`❌ Failed to update database with image filename for product ${catalogueId}`);
      return {
        success: false,
        error: 'Database update failed',
      };
    }

    console.log(`✅ Database updated with thumbnail filename: ${thumbFilename}`);

    const updatedEntry = await dbFood.getCatalogueEntryById(catalogueId);
    if (updatedEntry) {
      broadcastToAllUsers({
        type: 'CATALOGUE_IMAGE_GENERATED',
        data: updatedEntry,
      });
      console.log(`📡 Broadcasted CATALOGUE_IMAGE_GENERATED event for product ${catalogueId}`);
    }

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
  } finally {
    generatingImages.delete(catalogueId);
  }
}
