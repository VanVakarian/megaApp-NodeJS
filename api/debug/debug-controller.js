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

export async function enrichCatalogueEmbeddings(request, reply) {
  try {
    const count = Math.min(request.query.count || 1, 50);

    if (request.params.id) {
      const catalogueId = parseInt(request.params.id);
      if (!catalogueId || isNaN(catalogueId)) {
        return reply.code(400).send({
          result: false,
          error: 'Invalid catalogue ID',
        });
      }

      const result = await enrichSingleCatalogueEmbedding(catalogueId);
      return reply.send(result);
    }

    if (!request.params.id) {
      const results = [];
      let processed = 0;

      console.log(`🎯 Starting batch embedding enrichment: ${count} entries`);

      for (let i = 0; i < count; i++) {
        const allEntries = await dbFood.getAllFoodCatalogueEntries();
        const entryWithoutEmbedding = allEntries.find((entry) => !entry.nameVec && !entry.descriptionVec);

        if (!entryWithoutEmbedding) {
          console.log(
            `✅ Batch embedding enrichment completed: ${processed}/${count} entries processed (no more entries need embeddings)`
          );
          break;
        }

        console.log(
          `📊 Embedding progress: ${i + 1}/${count} - Processing entry ${entryWithoutEmbedding.id}: "${
            entryWithoutEmbedding.name
          }"`
        );

        const result = await enrichSingleCatalogueEmbedding(entryWithoutEmbedding.id);
        results.push(result);
        processed++;

        if (!result.result) {
          console.log(`❌ Batch embedding enrichment stopped at entry ${i + 1} due to error: ${result.error}`);
          break;
        }

        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(`🏁 Batch embedding enrichment finished: ${processed}/${count} entries successfully processed\n\n\n`);

      return reply.send({
        result: true,
        batchProcessing: true,
        processedCount: processed,
        requestedCount: count,
        results: results,
      });
    }
  } catch (error) {
    console.error('❌ Debug enrichCatalogueEmbeddings error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

async function enrichSingleCatalogueEmbedding(catalogueId) {
  try {
    const allEntries = await dbFood.getAllFoodCatalogueEntries();
    const entry = allEntries.find((e) => e.id === catalogueId);

    if (!entry) {
      return {
        result: false,
        error: 'Catalogue entry not found',
      };
    }

    console.log(`🔄 Generating embeddings for catalogue entry ${catalogueId}: "${entry.name}"`);

    console.log(`📝 Generating embedding for name: "${entry.name}"`);
    const embeddingNameResult = await aiService.generateEmbedding(entry.name);

    if (!embeddingNameResult.success) {
      console.log(`❌ Failed to generate name embedding: ${embeddingNameResult.error}`);
      return {
        result: false,
        error: embeddingNameResult.error,
        catalogueEntry: {
          id: entry.id,
          name: entry.name,
        },
      };
    }

    console.log(
      `✅ Successfully generated name embedding: ${embeddingNameResult.data.dimensions} dimensions, model: ${embeddingNameResult.metadata.model}, provider: ${embeddingNameResult.metadata.provider}`
    );

    let embeddingDescriptionResult = null;
    if (entry.description && entry.description.trim().length > 0) {
      console.log(`📝 Generating embedding for description: "${entry.description}"`);
      embeddingDescriptionResult = await aiService.generateEmbedding(entry.description);

      if (embeddingDescriptionResult.success) {
        console.log(
          `✅ Successfully generated description embedding: ${embeddingDescriptionResult.data.dimensions} dimensions`
        );
      } else {
        console.log(`⚠️ Failed to generate description embedding: ${embeddingDescriptionResult.error}`);
      }
    }

    const updateResult = await dbFood.updateCatalogueEntryEmbedding(
      entry.id,
      embeddingNameResult.data.embedding,
      embeddingDescriptionResult?.success ? embeddingDescriptionResult.data.embedding : null
    );

    if (updateResult) {
      console.log(`✅ Successfully updated catalogue entry ${entry.id} with embedding in database`);
    } else {
      console.log(`❌ Failed to update catalogue entry ${entry.id} with embedding in database`);
      return {
        result: false,
        error: 'Failed to update database with embeddings',
        catalogueEntry: {
          id: entry.id,
          name: entry.name,
        },
      };
    }

    return {
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
      },
      nameEmbedding: {
        dimensions: embeddingNameResult.data.dimensions,
        model: embeddingNameResult.metadata.model,
        provider: embeddingNameResult.metadata.provider,
        usage: embeddingNameResult.metadata.usage,
      },
      descriptionEmbedding: embeddingDescriptionResult?.success
        ? {
            dimensions: embeddingDescriptionResult.data.dimensions,
            model: embeddingDescriptionResult.metadata.model,
            provider: embeddingDescriptionResult.metadata.provider,
            usage: embeddingDescriptionResult.metadata.usage,
          }
        : null,
      dbUpdateSuccess: updateResult,
    };
  } catch (error) {
    console.error('❌ Error enriching single catalogue embedding:', error);
    return {
      result: false,
      error: error.message,
    };
  }
}

export async function searchByEmbedding(request, reply) {
  try {
    const query = request.query.query;
    if (!query || query.trim().length === 0) {
      return reply.code(400).send({
        result: false,
        error: 'Query parameter is required',
      });
    }

    const userId = 1;
    const limit = 20;

    console.log(`🔍 Searching by embedding for query: "${query}"`);

    const queryEmbeddingResult = await aiService.generateEmbedding(query);

    if (!queryEmbeddingResult.success) {
      console.log(`❌ Failed to generate embedding for search: ${queryEmbeddingResult.error}`);
      return reply.code(500).send({
        result: false,
        error: `Failed to generate embedding: ${queryEmbeddingResult.error}`,
      });
    }

    console.log(`✅ Generated embedding: ${queryEmbeddingResult.data.dimensions} dimensions`);

    const searchResults = await dbFood.searchCatalogueEntriesByEmbedding(queryEmbeddingResult.data.embedding);

    console.log(`\n🎯 Search Results for "${query}":`);
    console.log(`Found ${searchResults.length} results`);
    console.log(`\n📋 Top ${Math.min(searchResults.length, 20)} results:`);

    searchResults.forEach((result, index) => {
      const similarity = ((1 - result.distance) * 100).toFixed(1);
      console.log(
        `  ${index + 1}. "${result.name}" (${
          result.kcals
        }kcal) - Similarity: ${similarity}%, Distance: ${result.distance.toFixed(4)}`
      );
    });

    return reply.send({
      result: true,
      query: query,
      totalResults: searchResults.length,
      embeddingInfo: {
        dimensions: queryEmbeddingResult.data.dimensions,
        model: queryEmbeddingResult.metadata.model,
        provider: queryEmbeddingResult.metadata.provider,
      },
      results: searchResults.map((result, index) => ({
        rank: index + 1,
        id: result.id,
        name: result.name,
        kcals: result.kcals,
        protein: result.protein,
        fat: result.fat,
        carbs: result.carbs,
        fiber: result.fiber,
        distance: result.distance,
        similarity: ((1 - result.distance) * 100).toFixed(1),
      })),
    });
  } catch (error) {
    console.error('❌ Debug searchByEmbedding error:', error);
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
