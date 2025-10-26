import { execSync } from 'child_process';
import sharp from 'sharp';
import * as dbFood from '../../db/db-food.js';
import { AI_IMAGE_GENERATION, AI_PROVIDERS } from '../../env.js';
import * as aiService from '../ai/ai-service.js';
import * as debugService from './debug-service.js';

export async function testImageGeneration(request, reply) {
  try {
    const catalogueId = parseInt(request.params.id);
    const provider = request.query.provider;

    if (!catalogueId || isNaN(catalogueId)) {
      return reply.code(400).send({
        result: false,
        error: 'Invalid catalogue ID',
      });
    }

    if (!provider || !['openrouter', 'naga'].includes(provider)) {
      return reply.code(400).send({
        result: false,
        error: 'Invalid provider. Must be "openrouter" or "naga"',
      });
    }

    const allEntries = await dbFood.getAllFoodCatalogueEntries();
    const entry = allEntries.find((e) => e.id === catalogueId);

    if (!entry) {
      return reply.code(404).send({
        result: false,
        error: 'Catalogue entry not found',
      });
    }

    console.log(`🧪 Testing image generation for entry ${catalogueId}: "${entry.name}"`);

    const foodName = entry.name;
    const foodDescription = entry.description || '';

    const prompt = AI_IMAGE_GENERATION.FOOD_PRODUCT_PROMPT.replace('{productName}', foodName).replace(
      '{foodDescription}',
      foodDescription
    );

    console.log(`📝 Generated prompt: "${prompt}"`);
    console.log(`🎨 Using provider: ${provider}`);

    const startTime = Date.now();
    let imageResult;

    if (provider === 'openrouter') {
      imageResult = await aiService.generateImageOpenRouter(prompt);
    } else {
      imageResult = await aiService.generateImageNaga(prompt);
    }

    const generationTime = Date.now() - startTime;

    if (!imageResult.success) {
      console.log(`❌ Image generation failed: ${imageResult.error}`);
      return reply.code(500).send({
        result: false,
        catalogueEntry: {
          id: entry.id,
          name: entry.name,
          description: entry.description,
        },
        provider,
        prompt,
        error: imageResult.error,
        generationTime,
      });
    }

    console.log(`✅ Image generated successfully in ${generationTime}ms`);

    const imagesDir = join(process.cwd(), 'public', 'images', 'food');
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
      console.log(`📁 Created images directory: ${imagesDir}`);
    }

    const randomId = Math.random().toString(36).substring(2, 10);
    const originalFilename = `${randomId}-original.${imageResult.data.format}`;
    const originalFilePath = join(imagesDir, originalFilename);
    const thumbFilename = `${randomId}-thumb.webp`;
    const thumbFilePath = join(imagesDir, thumbFilename);

    writeFileSync(originalFilePath, imageResult.data.imageBuffer);
    console.log(`💾 Original image saved to: public/images/food/${originalFilename}`);

    const thumbStartTime = Date.now();
    await sharp(imageResult.data.imageBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(thumbFilePath);
    const thumbTime = Date.now() - thumbStartTime;
    console.log(`🖼️  Thumbnail (256x256 WebP) created in ${thumbTime}ms: public/images/food/${thumbFilename}`);

    return reply.send({
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
      },
      provider,
      model: imageResult.metadata.model,
      prompt,
      images: {
        original: {
          path: `public/images/food/${originalFilename}`,
          url: `/images/food/${originalFilename}`,
          format: imageResult.data.format,
        },
        thumbnail: {
          path: `public/images/food/${thumbFilename}`,
          url: `/images/food/${thumbFilename}`,
          size: '256x256',
          format: 'webp',
          generationTime: thumbTime,
        },
      },
      generationTime,
    });
  } catch (error) {
    console.error('❌ Debug testImageGeneration error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function ping(request, reply) {
  const message = await debugService.ping();
  return reply.send({ message: message });
}

export async function latestCommitInfo(request, reply) {
  let commitHash = 'unknown';
  let commitDateTime = 'unknown';

  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const rawDate = execSync('git show -s --format=%ci HEAD').toString().trim();

    const date = new Date(rawDate);
    commitDateTime = date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.error('❌ Failed to get git info:', error);
  }

  return { commitHash, commitDateTime };
}

export async function listCatalogueEntries(request, reply) {
  try {
    const allEntries = await dbFood.getAllFoodCatalogueEntries();

    const stats = {
      totalEntries: allEntries.length,
      entriesWithNutrition: allEntries.filter(
        (entry) =>
          (entry.protein !== null && entry.protein > 0) ||
          (entry.fat !== null && entry.fat > 0) ||
          (entry.carbs !== null && entry.carbs > 0)
      ).length,
      entriesWithDescription: allEntries.filter(
        (entry) => entry.description !== null && entry.description.trim().length > 0
      ).length,
      entriesWithEmbedding: allEntries.filter((entry) => entry.nameVec !== null || entry.descriptionVec !== null)
        .length,
    };

    console.log(`📊 Catalogue Statistics:`);
    console.log(`  - Total entries: ${stats.totalEntries}`);
    console.log(`  - With nutrition data: ${stats.entriesWithNutrition}`);
    console.log(`  - With descriptions: ${stats.entriesWithDescription}`);
    console.log(`  - With embeddings: ${stats.entriesWithEmbedding}`);
    console.log(`  - Need nutrition enrichment: ${stats.totalEntries - stats.entriesWithNutrition}`);
    console.log(`  - Need embedding enrichment: ${stats.totalEntries - stats.entriesWithEmbedding}`);

    console.log(`\n📋 First 10 entries:`);
    allEntries.slice(0, 10).forEach((entry) => {
      const hasNutrition = entry.protein > 0 || entry.fat > 0 || entry.carbs > 0;
      const hasDescription = entry.description && entry.description.trim().length > 0;
      const hasEmbedding = entry.nameVec !== null || entry.descriptionVec !== null;
      console.log(
        `  ${entry.id}. "${entry.name}" (${entry.kcals}kcal) ${hasNutrition ? '✅' : '❌'} ${
          hasDescription ? '📝' : '📄'
        } ${hasEmbedding ? '🔍' : '🔍❌'}`
      );
    });

    return reply.send({
      result: true,
      stats,
      entries: allEntries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        kcals: entry.kcals,
        hasNutrition: entry.protein > 0 || entry.fat > 0 || entry.carbs > 0,
        hasDescription: !!(entry.description && entry.description.trim().length > 0),
        hasEmbedding: entry.nameVec !== null || entry.descriptionVec !== null,
        protein: entry.protein,
        fat: entry.fat,
        carbs: entry.carbs,
        fiber: entry.fiber,
        description: entry.description,
      })),
    });
  } catch (error) {
    console.error('❌ Debug listCatalogueEntries error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function checkRateLimits(request, reply) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${AI_PROVIDERS.TEXT_GENERATION_OPENROUTER.API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return reply.send({
      result: true,
      data: data,
    });
  } catch (error) {
    console.error('❌ Error checking rate limits:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function exportCatalogueToBackup(request, reply) {
  try {
    console.log('📤 Starting catalogue export to backup...');

    const allEntries = await dbFood.getAllFoodCatalogueEntries();

    if (!allEntries || allEntries.length === 0) {
      console.log('❌ No catalogue entries found to export');
      return reply.code(404).send({
        result: false,
        error: 'No catalogue entries found',
      });
    }

    const cleanedEntries = allEntries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
    }));

    const timestamp = new Date().toISOString();
    const filename = `catalogue-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const backupsDir = join(process.cwd(), 'backups');
    const filePath = join(backupsDir, filename);

    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
      console.log(`📁 Created backups directory: ${backupsDir}`);
    }

    const exportData = {
      timestamp: timestamp,
      totalEntries: cleanedEntries.length,
      exportedBy: 'debug-api',
      metadata: {
        version: '1.0',
        description: 'Food catalogue backup export',
        source: 'foodCatalogue table',
      },
      entries: cleanedEntries,
    };

    writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8');

    console.log(`✅ Successfully exported ${cleanedEntries.length} catalogue entries to: backups/${filename}`);

    return reply.send({
      result: true,
      filename: filename,
      filePath: `backups/${filename}`,
      totalEntries: cleanedEntries.length,
      timestamp: timestamp,
      message: `Successfully exported ${cleanedEntries.length} catalogue entries`,
    });
  } catch (error) {
    console.error('❌ Export catalogue error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function importCatalogueFromBackup(request, reply) {
  try {
    const filename = request.body?.filename;

    if (!filename) {
      return reply.code(400).send({
        result: false,
        error: 'Filename parameter is required',
      });
    }

    console.log(`📥 Starting catalogue import from backup: ${filename}`);

    const backupsDir = join(process.cwd(), 'backups');
    const filePath = join(backupsDir, filename);

    if (!existsSync(filePath)) {
      console.log(`❌ Backup file not found: ${filePath}`);
      return reply.code(404).send({
        result: false,
        error: `Backup file not found: ${filename}`,
      });
    }

    let backupData;
    try {
      const fileContent = readFileSync(filePath, 'utf8');
      backupData = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('❌ Failed to parse backup file:', parseError);
      return reply.code(400).send({
        result: false,
        error: 'Invalid JSON format in backup file',
      });
    }

    if (!backupData.entries || !Array.isArray(backupData.entries)) {
      return reply.code(400).send({
        result: false,
        error: 'Invalid backup file format - missing entries array',
      });
    }

    console.log(`📊 Backup file contains ${backupData.entries.length} entries`);
    console.log(`🗑️  Clearing existing catalogue entries...`);

    const deletedCount = await dbFood.clearAllFoodCatalogueEntries();
    console.log(`✅ Cleared ${deletedCount} existing entries`);

    console.log(`📥 Importing ${backupData.entries.length} entries...`);
    const importedCount = await dbFood.importFoodCatalogueEntries(backupData.entries);

    if (importedCount === null) {
      console.log(`❌ Failed to import entries`);
      return reply.code(500).send({
        result: false,
        error: 'Failed to import catalogue entries',
      });
    }

    console.log(`✅ Successfully imported ${importedCount}/${backupData.entries.length} entries`);

    return reply.send({
      result: true,
      filename: filename,
      totalEntriesInBackup: backupData.entries.length,
      deletedCount: deletedCount,
      importedCount: importedCount,
      skippedCount: backupData.entries.length - importedCount,
      timestamp: new Date().toISOString(),
      message: `Successfully imported ${importedCount} catalogue entries from backup`,
    });
  } catch (error) {
    console.error('❌ Import catalogue error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}
