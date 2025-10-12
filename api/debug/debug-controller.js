import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as dbFood from '../../db/db-food.js';
import {
  AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
  AI_FOOD_DESCRIPTION_MODELS,
  AI_PROMPTS,
  AI_PROVIDERS,
} from '../../env.js';
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
    const foodDescription = entry.descriptionForEmbedding || '';

    const prompt = AI_PROMPTS.IMAGE_GENERATION_BASE.replace('{foodName}', foodName).replace(
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
          description: entry.descriptionForEmbedding,
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
    const filename = `${randomId}.${imageResult.data.format}`;
    const filePath = join(imagesDir, filename);

    writeFileSync(filePath, imageResult.data.imageBuffer);
    console.log(`💾 Image saved to: public/images/food/${filename}`);

    return reply.send({
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
        description: entry.descriptionForEmbedding,
      },
      provider,
      model: imageResult.metadata.model,
      prompt,
      imageFilePath: `public/images/food/${filename}`,
      relativeUrl: `/images/food/${filename}`,
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

function filterOutliersByMAD(results, outlierThreshold = 75) {
  if (results.length < 3) {
    return results;
  }

  const nutritionFields = [
    { field: 'kcals', minPercentThreshold: outlierThreshold },
    { field: 'protein', minPercentThreshold: outlierThreshold },
    { field: 'fat', minPercentThreshold: outlierThreshold },
    { field: 'carbs', minPercentThreshold: outlierThreshold },
    { field: 'fiber', minPercentThreshold: outlierThreshold },
  ];

  const outlierIndices = new Set();
  const outlierReasons = new Map();

  nutritionFields.forEach(({ field, minPercentThreshold }) => {
    const values = results.map((r) => r.data[field]);

    const sortedValues = [...values].sort((a, b) => a - b);
    const median = sortedValues[Math.floor(sortedValues.length / 2)];

    if (median === 0) {
      return;
    }

    values.forEach((value, index) => {
      const percentDifference = Math.abs((value - median) / median) * 100;

      if (percentDifference > minPercentThreshold) {
        outlierIndices.add(index);

        if (!outlierReasons.has(index)) {
          outlierReasons.set(index, []);
        }
        outlierReasons.get(index).push(`${field}: ${value} vs ${median.toFixed(1)}`);
      }
    });
  });

  outlierReasons.forEach((reasons, index) => {
    console.log(`🚫 Outlier detected: ${results[index].model} (${reasons.join(', ')})`);
  });

  const filteredResults = results.filter((_, index) => !outlierIndices.has(index));
  return filteredResults;
}

function saveEnrichmentResult(catalogueEntry, llmResults, weightedAverage) {
  try {
    const timestamp = new Date().toISOString();
    const filename = `enrichment-results-${new Date().toISOString().slice(0, 10)}.json`;
    const backupsDir = join(process.cwd(), 'backups');
    const filePath = join(backupsDir, filename);

    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
      console.log(`📁 Created backups directory: ${backupsDir}`);
    }

    const resultEntry = {
      timestamp,
      catalogueEntry,
      llmResults,
      weightedAverage,
    };

    let existingData = [];
    if (existsSync(filePath)) {
      try {
        const fileContent = readFileSync(filePath, 'utf8');
        existingData = JSON.parse(fileContent);
        if (!Array.isArray(existingData)) {
          console.warn(`📁 File ${filename} contains invalid data, starting fresh`);
          existingData = [];
        }
      } catch (parseError) {
        console.warn(`📁 Failed to parse existing file ${filename}, starting fresh:`, parseError.message);
        existingData = [];
      }
    }

    existingData.push(resultEntry);

    writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');

    console.log(`💾 Enrichment result saved to: backups/${filename}`);
    console.log(`📊 Total entries in file: ${existingData.length}`);

    return { success: true, filename, totalEntries: existingData.length, filePath: `backups/${filename}` };
  } catch (error) {
    console.error('❌ Failed to save enrichment result:', error);
    return { success: false, error: error.message };
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

export async function testLlm(request, reply) {
  try {
    const testDescription = request.query.description || 'домашний творог с медом';

    const result = await aiService.generateGeneralizedProduct(testDescription);

    if (result.success) {
      return reply.send({
        result: true,
        input: testDescription,
        data: result.data,
        metadata: result.metadata,
      });
    } else {
      return reply.code(500).send({
        result: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('❌ Debug LLM test error:', error);
    return reply.code(500).send({
      result: false,
      error: 'Internal server error',
    });
  }
}

export async function enrichCatalogueEntries(request, reply) {
  try {
    const threshold = request.query.threshold || 75;
    const count = Math.min(request.query.count || 1, 100); // Limit to a maximum of 100 entries

    if (request.params.id) {
      const catalogueId = parseInt(request.params.id);
      if (!catalogueId || isNaN(catalogueId)) {
        return reply.code(400).send({
          result: false,
          error: 'Invalid catalogue ID',
        });
      }

      const result = await enrichSingleCatalogueEntry(catalogueId, threshold);
      return reply.send(result);
    }

    if (!request.params.id) {
      const results = [];
      let processed = 0;

      console.log(`🎯 Starting batch enrichment: ${count} entries with threshold ${threshold}%`);

      for (let i = 0; i < count; i++) {
        const allEntries = await dbFood.getAllFoodCatalogueEntries();
        const entryWithoutDescription = allEntries.find(
          (entry) => !entry.descriptionForEmbedding || entry.descriptionForEmbedding.trim().length === 0
        );

        if (!entryWithoutDescription) {
          console.log(
            `✅ Batch enrichment completed: ${processed}/${count} entries processed (no more entries need enrichment)`
          );
          break;
        }

        console.log(
          `📊 Batch progress: ${i + 1}/${count} - Processing entry ${entryWithoutDescription.id}: "${
            entryWithoutDescription.name
          }"`
        );

        const result = await enrichSingleCatalogueEntry(entryWithoutDescription.id, threshold);
        results.push(result);
        processed++;

        if (!result.result) {
          console.log(`❌ Batch enrichment stopped at entry ${i + 1} due to error: ${result.error}`);
          break;
        }

        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(`🏁 Batch enrichment finished: ${processed}/${count} entries successfully processed\n\n\n`);

      return reply.send({
        result: true,
        batchProcessing: true,
        processedCount: processed,
        requestedCount: count,
        threshold: threshold,
        results: results,
      });
    }
  } catch (error) {
    console.error('❌ Debug enrichCatalogueEntry error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

async function enrichSingleCatalogueEntry(catalogueId, threshold = 75) {
  try {
    const allEntries = await dbFood.getAllFoodCatalogueEntries();
    const entry = allEntries.find((e) => e.id === catalogueId);

    if (!entry) {
      return {
        result: false,
        error: 'Catalogue entry not found',
      };
    }

    console.log(`🔄 Enriching catalogue entry ${catalogueId}: "${entry.name}"`);

    const multiResult = await aiService.runMultipleModels(entry.name);

    if (!multiResult.success) {
      console.log(`❌ LLM enrichment failed: ${multiResult.error}`);
      return reply.code(500).send({
        result: false,
        error: `LLM enrichment failed: ${multiResult.error}`,
        catalogueEntry: {
          id: entry.id,
          name: entry.name,
          currentKcals: entry.kcals,
        },
      });
    }

    console.log(`📊 LLM Results Summary:`);
    console.log(`  - Total models: ${multiResult.summary.totalModels}`);
    console.log(`  - Successful: ${multiResult.summary.successfulModels}`);
    console.log(`  - Failed: ${multiResult.summary.failedModels}`);
    console.log(`  - Avg response time: ${multiResult.summary.averageResponseTime}ms`);

    multiResult.results.forEach((result, index) => {
      const timeSeconds = (result.responseTime / 1000).toFixed(1);
      console.log(`\n🤖 Model ${index + 1}: ${result.model}`);

      if (result.success) {
        console.log(`  ✅ Success`);
        console.log(`  ⏱️  Response time: ${timeSeconds}s (${result.responseTime}ms)`);
        console.log(`  📝 Generalized name: "${result.data.generalizedName}"`);
        console.log(`  🍎 KBJU: ${result.data.kcals}kcal, P:${result.data.protein}g, F:${result.data.fat}g, C:${result.data.carbs}g, Fiber:${result.data.fiber}g`); // prettier-ignore
        console.log(`  📖 Description: "${result.data.descriptionForEmbedding}"`);
      } else {
        console.log(`  ❌ Failed`);
        console.log(`  ⏱️  Response time: ${timeSeconds}s (${result.responseTime}ms)`);
        console.log(`  🚫 Error: ${result.error}`);
      }
    });

    const successfulResults = multiResult.results.filter((r) => r.success);
    let weightedAverage = null;

    if (successfulResults.length > 0) {
      const filteredResults = filterOutliersByMAD(successfulResults, threshold);
      console.log(
        `📊 Outlier filtering: ${successfulResults.length} → ${filteredResults.length} results (removed ${
          successfulResults.length - filteredResults.length
        } outliers, threshold: ${threshold}%)`
      );

      if (filteredResults.length === 0) {
        console.log(`⚠️  All results were filtered as outliers, using original results`);
        filteredResults.push(...successfulResults);
      }

      const resultsCount = filteredResults.length;

      weightedAverage = {
        kcals: filteredResults.reduce((sum, r) => sum + r.data.kcals, 0) / resultsCount,
        protein: filteredResults.reduce((sum, r) => sum + r.data.protein, 0) / resultsCount,
        fat: filteredResults.reduce((sum, r) => sum + r.data.fat, 0) / resultsCount,
        carbs: filteredResults.reduce((sum, r) => sum + r.data.carbs, 0) / resultsCount,
        fiber: filteredResults.reduce((sum, r) => sum + r.data.fiber, 0) / resultsCount,
      };

      const longestDescription = filteredResults
        .map((r) => r.data.descriptionForEmbedding)
        .reduce((longest, current) => (current.length > longest.length ? current : longest), '');

      const kcalsDiff = weightedAverage.kcals - (entry.kcals || 0);
      const kcalsDiffPercent = entry.kcals ? ((weightedAverage.kcals - entry.kcals) / entry.kcals) * 100 : null;

      weightedAverage.kcalsComparison = {
        db: entry.kcals || 0,
        llm: weightedAverage.kcals,
        diff: kcalsDiff,
        diffPercent: kcalsDiffPercent,
      };

      weightedAverage.selectedDescription = longestDescription;

      console.log(`\n📊 Average KBJU (arithmetic mean):`);
      console.log(`  🍎 KBJU: ${weightedAverage.kcals.toFixed(1)}kcal, P:${weightedAverage.protein.toFixed(1)}g, F:${weightedAverage.fat.toFixed(1)}g, C:${weightedAverage.carbs.toFixed(1)}g, Fiber:${weightedAverage.fiber.toFixed(1)}g`); // prettier-ignore
      console.log(`  🔥 Kcals comparison: DB=${entry.kcals || 0} → LLM=${weightedAverage.kcals.toFixed(1)} (${kcalsDiff >= 0 ? '+' : ''}${kcalsDiff.toFixed(1)}${kcalsDiffPercent !== null ? `, ${kcalsDiffPercent >= 0 ? '+' : ''}${kcalsDiffPercent.toFixed(1)}%` : ''})`); // prettier-ignore
      console.log(`  📖 Selected description (longest): "${longestDescription}"`);

      const updateResult = await dbFood.updateFoodCatalogueNutrition(
        entry.id,
        Math.round(weightedAverage.kcals),
        Math.round(weightedAverage.protein * 10) / 10,
        Math.round(weightedAverage.fat * 10) / 10,
        Math.round(weightedAverage.carbs * 10) / 10,
        Math.round(weightedAverage.fiber * 10) / 10,
        longestDescription
      );

      if (updateResult) {
        console.log(`✅ Successfully updated catalogue entry ${entry.id} in database`);
        weightedAverage.dbUpdateSuccess = true;
      } else {
        console.log(`❌ Failed to update catalogue entry ${entry.id} in database`);
        weightedAverage.dbUpdateSuccess = false;
      }
    }

    const saveResult = saveEnrichmentResult(
      {
        id: entry.id,
        name: entry.name,
        currentKcals: entry.kcals,
      },
      multiResult,
      weightedAverage
    );

    return {
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
        currentKcals: entry.kcals,
      },
      llmResults: multiResult,
      weightedAverage,
      saveInfo: saveResult,
    };
  } catch (error) {
    console.error('❌ Debug enrichSingleCatalogueEntry error:', error);
    return {
      result: false,
      error: error.message,
    };
  }
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
        (entry) => entry.descriptionForEmbedding !== null && entry.descriptionForEmbedding.trim().length > 0
      ).length,
      entriesWithEmbedding: allEntries.filter((entry) => entry.embedding !== null).length,
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
      const hasDescription = entry.descriptionForEmbedding && entry.descriptionForEmbedding.trim().length > 0;
      const hasEmbedding = entry.embedding !== null;
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
        hasDescription: !!(entry.descriptionForEmbedding && entry.descriptionForEmbedding.trim().length > 0),
        hasEmbedding: entry.embedding !== null,
        protein: entry.protein,
        fat: entry.fat,
        carbs: entry.carbs,
        fiber: entry.fiber,
        descriptionForEmbedding: entry.descriptionForEmbedding,
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

// ============================================================================================ EMBEDDING ENRICHMENT ===

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
        const entryWithoutEmbedding = allEntries.find((entry) => !entry.embedding);

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

    console.log(`🔄 Generating embedding for catalogue entry ${catalogueId}: "${entry.name}"`);

    const textForEmbedding = prepareTextForEmbedding(entry);
    console.log(`📝 Text for embedding: "${textForEmbedding}"`);

    const embeddingResult = await aiService.generateEmbedding(textForEmbedding);

    if (!embeddingResult.success) {
      console.log(`❌ Failed to generate embedding: ${embeddingResult.error}`);
      return {
        result: false,
        error: embeddingResult.error,
        catalogueEntry: {
          id: entry.id,
          name: entry.name,
          textUsed: textForEmbedding,
        },
      };
    }

    console.log(
      `✅ Successfully generated embedding: ${embeddingResult.data.dimensions} dimensions, model: ${embeddingResult.metadata.model}, provider: ${embeddingResult.metadata.provider}`
    );

    const updateResult = await dbFood.updateCatalogueEntryEmbedding(entry.id, embeddingResult.data.embedding);

    if (updateResult) {
      console.log(`✅ Successfully updated catalogue entry ${entry.id} with embedding in database`);
    } else {
      console.log(`❌ Failed to update catalogue entry ${entry.id} with embedding in database`);
      return {
        result: false,
        error: 'Failed to update database with embedding',
        catalogueEntry: {
          id: entry.id,
          name: entry.name,
          textUsed: textForEmbedding,
        },
        embeddingResult,
      };
    }

    const saveResult = saveEmbeddingResult(
      {
        id: entry.id,
        name: entry.name,
        textUsed: textForEmbedding,
      },
      embeddingResult
    );

    return {
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
        textUsed: textForEmbedding,
      },
      embeddingResult: {
        dimensions: embeddingResult.data.dimensions,
        model: embeddingResult.metadata.model,
        provider: embeddingResult.metadata.provider,
        usage: embeddingResult.metadata.usage,
      },
      dbUpdateSuccess: updateResult,
      saveResult: saveResult,
    };
  } catch (error) {
    console.error('❌ Error enriching single catalogue embedding:', error);
    return {
      result: false,
      error: error.message,
    };
  }
}

function prepareTextForEmbedding(catalogueEntry) {
  let text = catalogueEntry.name;

  if (catalogueEntry.descriptionForEmbedding && catalogueEntry.descriptionForEmbedding.trim().length > 0) {
    text += ` ${catalogueEntry.descriptionForEmbedding}`;
  }

  return text.trim();
}

function saveEmbeddingResult(catalogueEntry, embeddingResult) {
  try {
    const timestamp = new Date().toISOString();
    const filename = `embedding-results-${new Date().toISOString().slice(0, 10)}.json`;
    const backupsDir = join(process.cwd(), 'backups');
    const filePath = join(backupsDir, filename);

    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
      console.log(`📁 Created backups directory: ${backupsDir}`);
    }

    const resultEntry = {
      timestamp,
      catalogueEntry,
      embeddingResult: {
        dimensions: embeddingResult.data.dimensions,
        model: embeddingResult.metadata.model,
        provider: embeddingResult.metadata.provider,
        usage: embeddingResult.metadata.usage,
      },
    };

    let existingData = [];
    if (existsSync(filePath)) {
      try {
        const fileContent = readFileSync(filePath, 'utf8');
        existingData = JSON.parse(fileContent);
        if (!Array.isArray(existingData)) {
          console.warn(`📁 File ${filename} contains invalid data, starting fresh`);
          existingData = [];
        }
      } catch (parseError) {
        console.warn(`📁 Failed to parse existing file ${filename}, starting fresh:`, parseError.message);
        existingData = [];
      }
    }

    existingData.push(resultEntry);

    writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');

    console.log(`💾 Embedding result saved to: backups/${filename}`);
    console.log(`📊 Total entries in file: ${existingData.length}`);

    return { success: true, filename, totalEntries: existingData.length, filePath: `backups/${filename}` };
  } catch (error) {
    console.error('❌ Failed to save embedding result:', error);
    return { success: false, error: error.message };
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

    const searchResults = await dbFood.searchCatalogueEntriesByEmbedding(
      queryEmbeddingResult.data.embedding,
      userId,
      limit
    );

    console.log(`\n🎯 Search Results for "${query}":`);
    console.log(`Found ${searchResults.length} results`);
    console.log(`\n📋 Top ${Math.min(searchResults.length, 20)} results:`);

    searchResults.forEach((result, index) => {
      const similarity = ((1 - result.distance) * 100).toFixed(1);
      console.log(`  ${index + 1}. "${result.name}" (${result.kcals}kcal) - Similarity: ${similarity}%, Distance: ${result.distance.toFixed(4)}`); // prettier-ignore
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

// ============================================================================================ CATALOGUE MANAGEMENT ===

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
      descriptionForEmbedding: entry.descriptionForEmbedding,
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

// =========================================================================================== PROMPT TESTING ===

export async function testPrompts(request, reply) {
  try {
    const catalogueId = parseInt(request.params.id);
    if (!catalogueId || isNaN(catalogueId)) {
      return reply.code(400).send({
        result: false,
        error: 'Invalid catalogue ID',
      });
    }

    console.log(
      `🧪 Matrix testing: 1 prompt × ${AI_FOOD_DESCRIPTION_MODELS.length} models = ${AI_FOOD_DESCRIPTION_MODELS.length} total tests`
    );

    const allEntries = await dbFood.getAllFoodCatalogueEntries();
    const entry = allEntries.find((e) => e.id === catalogueId);

    if (!entry) {
      return reply.code(404).send({
        result: false,
        error: 'Catalogue entry not found',
      });
    }

    console.log(`📝 Testing entry: "${entry.name}" - "${entry.descriptionForEmbedding || 'no description'}"`);

    const originalInput = `${entry.name}${entry.descriptionForEmbedding ? ` - ${entry.descriptionForEmbedding}` : ''}`;
    const results = [];
    let testNumber = 1;

    for (const model of AI_FOOD_DESCRIPTION_MODELS) {
      console.log(`\n🔄 Test ${testNumber}/${AI_FOOD_DESCRIPTION_MODELS.length}: ${model}`);

      const startTime = Date.now();

      try {
        const userPrompt = AI_FOOD_DESCRIPTION_USER_PROMPT.replace('{originalName}', entry.name).replace(
          '{originalDescription}',
          entry.descriptionForEmbedding || ''
        );

        const llmResult = await callOpenRouterAPI({
          model: model,
          systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
          userPrompt: userPrompt,
        });

        const responseTime = Date.now() - startTime;

        if (llmResult.success) {
          let parsedResult = null;
          let parseError = null;

          try {
            parsedResult = parseJSONWithFallback(llmResult.data.content);

            if (!parsedResult.name || !parsedResult.description) {
              parseError = 'Missing required fields: name and/or description';
            }
          } catch (err) {
            parseError = `JSON parse error: ${err.message}`;
          }

          results.push({
            testNumber,
            model,
            success: !parseError,
            responseTime,
            rawResponse: llmResult.data.content,
            parsedResult,
            parseError,
            usage: llmResult.metadata?.usage,
          });

          console.log(`  ✅ Success (${responseTime}ms)`);
          if (parsedResult && !parseError) {
            console.log(`    Name: "${parsedResult.name}"`);
            console.log(`    Description: "${parsedResult.description.substring(0, 80)}..."`);
          } else {
            console.log(`    ❌ Parse error: ${parseError}`);
          }
        } else {
          results.push({
            testNumber,
            model,
            success: false,
            responseTime,
            error: llmResult.error,
            rawResponse: null,
            parsedResult: null,
            parseError: null,
            usage: null,
          });

          console.log(`  ❌ Failed (${responseTime}ms): ${llmResult.error}`);
        }

        // Пауза между запросами
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results.push({
          testNumber,
          model,
          success: false,
          responseTime,
          error: error.message,
          rawResponse: null,
          parsedResult: null,
          parseError: null,
          usage: null,
        });

        console.log(`  ❌ Exception (${responseTime}ms): ${error.message}`);
      }

      testNumber++;
    }

    const saveResult = savePromptTestResults(entry, originalInput, results);

    // Подсчёт статистики
    const summary = {
      totalTests: results.length,
      totalModels: AI_FOOD_DESCRIPTION_MODELS.length,
      successfulTests: results.filter((r) => r.success).length,
      failedTests: results.filter((r) => !r.success).length,
      averageResponseTime: Math.round(results.reduce((sum, r) => sum + r.responseTime, 0) / results.length),
      successRate: Math.round((results.filter((r) => r.success).length / results.length) * 100),
    };

    // Статистика по моделям
    const modelStats = {};
    AI_FOOD_DESCRIPTION_MODELS.forEach((model) => {
      const modelResults = results.filter((r) => r.model === model);
      modelStats[model] = {
        total: modelResults.length,
        successful: modelResults.filter((r) => r.success).length,
        successRate: Math.round((modelResults.filter((r) => r.success).length / modelResults.length) * 100),
        avgResponseTime: Math.round(modelResults.reduce((sum, r) => sum + r.responseTime, 0) / modelResults.length),
      };
    });

    console.log(`\n📊 Matrix testing summary:`);
    console.log(
      `  - Total tests: ${summary.totalTests} (${summary.totalPrompts} prompts × ${summary.totalModels} models)`
    );
    console.log(`  - Successful: ${summary.successfulTests}`);
    console.log(`  - Failed: ${summary.failedTests}`);
    console.log(`  - Success rate: ${summary.successRate}%`);
    console.log(`  - Average response time: ${summary.averageResponseTime}ms`);

    return reply.send({
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
        description: entry.descriptionForEmbedding,
        originalInput,
      },
      matrixConfig: {
        models: AI_FOOD_DESCRIPTION_MODELS,
        systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT.substring(0, 100) + '...',
      },
      summary,
      modelStats,
      results,
      saveInfo: saveResult,
    });
  } catch (error) {
    console.error('❌ Debug testPrompts error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

function parseJSONWithFallback(rawResponse) {
  // Стратегия 1: Чистый JSON
  try {
    return JSON.parse(rawResponse);
  } catch (e1) {
    console.log(`❌ Strategy 1 failed: ${e1.message}`);
  }

  // Стратегия 2: Удаление ```json блоков
  try {
    const cleanedResponse = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    console.log(`🔄 Trying Strategy 2 with cleaned response: ${cleanedResponse.substring(0, 50)}...`);
    return JSON.parse(cleanedResponse);
  } catch (e2) {
    console.log(`❌ Strategy 2 failed: ${e2.message}`);
  }

  // Стратегия 3: Извлечение JSON из текста регулярными выражениями
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log(`🔄 Trying Strategy 3 with extracted JSON: ${jsonMatch[0].substring(0, 50)}...`);
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e3) {
    console.log(`❌ Strategy 3 failed: ${e3.message}`);
  }

  // Стратегия 4: Поиск многострочного JSON
  try {
    const lines = rawResponse.split('\n');
    const startIdx = lines.findIndex((line) => line.trim().startsWith('{'));
    const endIdx = lines.findLastIndex((line) => line.trim().endsWith('}'));

    if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
      const jsonLines = lines.slice(startIdx, endIdx + 1);
      const reconstructedJson = jsonLines.join('\n');
      console.log(`🔄 Trying Strategy 4 with reconstructed JSON: ${reconstructedJson.substring(0, 50)}...`);
      return JSON.parse(reconstructedJson);
    }
  } catch (e4) {
    console.log(`❌ Strategy 4 failed: ${e4.message}`);
  }

  throw new Error(`All parsing strategies failed for response: ${rawResponse.substring(0, 100)}...`);
}

async function callOpenRouterAPI({ model, systemPrompt, userPrompt }) {
  try {
    const response = await fetch(AI_PROVIDERS.TEXT_GENERATION_OPENROUTER.BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_PROVIDERS.TEXT_GENERATION_OPENROUTER.API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: AI_PROVIDERS.TEXT_GENERATION_OPENROUTER.MAX_TOKENS,
        temperature: AI_PROVIDERS.TEXT_GENERATION_OPENROUTER.TEMPERATURE,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorData}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        content: data.choices[0].message.content,
      },
      metadata: {
        model: data.model,
        usage: data.usage,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function savePromptTestResults(catalogueEntry, originalInput, results, testingMode = 'matrix') {
  try {
    const timestamp = new Date().toISOString();
    const filename = `matrix-prompt-test-results-${new Date().toISOString().slice(0, 10)}.json`;
    const backupsDir = join(process.cwd(), 'backups');
    const filePath = join(backupsDir, filename);

    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
      console.log(`📁 Created backups directory: ${backupsDir}`);
    }

    const resultEntry = {
      timestamp,
      testingMode,
      catalogueEntry: {
        id: catalogueEntry.id,
        name: catalogueEntry.name,
        description: catalogueEntry.descriptionForEmbedding,
        originalInput,
      },
      matrixConfig: {
        totalModels: AI_FOOD_DESCRIPTION_MODELS.length,
        totalTests: results.length,
        models: AI_FOOD_DESCRIPTION_MODELS,
        systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
      },
      results,
    };

    let existingData = [];
    if (existsSync(filePath)) {
      try {
        const fileContent = readFileSync(filePath, 'utf8');
        existingData = JSON.parse(fileContent);
        if (!Array.isArray(existingData)) {
          console.warn(`📁 File ${filename} contains invalid data, starting fresh`);
          existingData = [];
        }
      } catch (parseError) {
        console.warn(`📁 Failed to parse existing file ${filename}, starting fresh:`, parseError.message);
        existingData = [];
      }
    }

    existingData.push(resultEntry);

    writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');

    console.log(`💾 Matrix test results saved to: backups/${filename}`);
    console.log(`📊 Total matrix test sessions in file: ${existingData.length}`);

    return { success: true, filename, totalSessions: existingData.length, filePath: `backups/${filename}` };
  } catch (error) {
    console.error('❌ Failed to save matrix test results:', error);
    return { success: false, error: error.message };
  }
}

export async function testPromptsParallel(request, reply) {
  try {
    const catalogueId = parseInt(request.params.id);
    if (!catalogueId || isNaN(catalogueId)) {
      return reply.code(400).send({
        result: false,
        error: 'Invalid catalogue ID',
      });
    }

    // Настройки для параллельного выполнения
    const parallelismLevel = parseInt(request.query.parallelism) || 3; // По умолчанию 3 одновременных запроса
    const requestDelay = parseInt(request.query.delay) || 100; // Минимальная задержка между запросами
    const useStaggered = request.query.staggered !== 'false'; // Ступенчатый запуск (по умолчанию включен)

    console.log(
      `🚀 Parallel matrix testing: ${AI_FOOD_DESCRIPTION_MODELS.length} models (parallelism: ${parallelismLevel})`
    );
    console.log(`⚡ Delay: ${requestDelay}ms, Staggered: ${useStaggered}`);

    const allEntries = await dbFood.getAllFoodCatalogueEntries();
    const entry = allEntries.find((e) => e.id === catalogueId);

    if (!entry) {
      return reply.code(404).send({
        result: false,
        error: 'Catalogue entry not found',
      });
    }

    console.log(`📝 Testing entry: "${entry.name}" - "${entry.descriptionForEmbedding || 'no description'}"`);

    const originalInput = `${entry.name}${entry.descriptionForEmbedding ? ` - ${entry.descriptionForEmbedding}` : ''}`;

    const allTasks = [];
    let testNumber = 1;

    for (const model of AI_FOOD_DESCRIPTION_MODELS) {
      allTasks.push({
        testNumber: testNumber++,
        model,
        userPrompt: AI_FOOD_DESCRIPTION_USER_PROMPT.replace('{originalName}', entry.name).replace(
          '{originalDescription}',
          entry.descriptionForEmbedding || ''
        ),
      });
    }

    const startTime = Date.now();
    const results = await executeTasksInParallel(allTasks, parallelismLevel, requestDelay, useStaggered);
    const totalTime = Date.now() - startTime;

    const saveResult = savePromptTestResults(entry, originalInput, results, 'parallel');

    const summary = {
      totalTests: results.length,
      totalModels: AI_FOOD_DESCRIPTION_MODELS.length,
      successfulTests: results.filter((r) => r.success).length,
      failedTests: results.filter((r) => !r.success).length,
      averageResponseTime: Math.round(results.reduce((sum, r) => sum + r.responseTime, 0) / results.length),
      successRate: Math.round((results.filter((r) => r.success).length / results.length) * 100),
      totalExecutionTime: totalTime,
      parallelismLevel,
      requestDelay,
    };

    const modelStats = {};
    AI_FOOD_DESCRIPTION_MODELS.forEach((model) => {
      const modelResults = results.filter((r) => r.model === model);
      modelStats[model] = {
        total: modelResults.length,
        successful: modelResults.filter((r) => r.success).length,
        successRate: Math.round((modelResults.filter((r) => r.success).length / modelResults.length) * 100),
        avgResponseTime: Math.round(modelResults.reduce((sum, r) => sum + r.responseTime, 0) / modelResults.length),
      };
    });

    console.log(`\n🚀 Parallel matrix testing summary:`);
    console.log(
      `  - Total tests: ${summary.totalTests} (${summary.totalPrompts} prompts × ${summary.totalModels} models)`
    );
    console.log(`  - Successful: ${summary.successfulTests}`);
    console.log(`  - Failed: ${summary.failedTests}`);
    console.log(`  - Success rate: ${summary.successRate}%`);
    console.log(`  - Average response time: ${summary.averageResponseTime}ms`);
    console.log(`  - Total execution time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
    console.log(`  - Performance improvement: ${summary.performanceImprovement}`);

    return reply.send({
      result: true,
      catalogueEntry: {
        id: entry.id,
        name: entry.name,
        description: entry.descriptionForEmbedding,
        originalInput,
      },
      matrixConfig: {
        models: AI_FOOD_DESCRIPTION_MODELS,
        systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT.substring(0, 100) + '...',
        parallelismLevel,
        requestDelay,
        useStaggered,
      },
      summary,
      modelStats,
      results,
      saveInfo: saveResult,
    });
  } catch (error) {
    console.error('❌ Debug testPromptsParallel error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

// Функция для параллельного выполнения задач с контролем rate limit
async function executeTasksInParallel(tasks, parallelismLevel, requestDelay, useStaggered) {
  const results = [];
  const executing = new Set();

  // Функция для выполнения одной задачи
  async function executeTask(task, delayMs = 0) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log(`\n🔄 Test ${task.testNumber}/${tasks.length}: ${task.model}`);
    const startTime = Date.now();

    try {
      const llmResult = await callOpenRouterAPI({
        model: task.model,
        systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
        userPrompt: task.userPrompt,
      });

      const responseTime = Date.now() - startTime;

      if (llmResult.success) {
        let parsedResult = null;
        let parseError = null;

        try {
          parsedResult = parseJSONWithFallbackAdvanced(llmResult.data.content);

          if (!parsedResult.name || !parsedResult.description) {
            parseError = 'Missing required fields: name and/or description';
          }
        } catch (err) {
          parseError = `JSON parse error: ${err.message}`;
        }

        const result = {
          testNumber: task.testNumber,
          model: task.model,
          success: !parseError,
          responseTime,
          rawResponse: llmResult.data.content,
          parsedResult,
          parseError,
          usage: llmResult.metadata?.usage,
        };

        results.push(result);
        console.log(`  ✅ Success (${responseTime}ms)`);
        if (parsedResult && !parseError) {
          console.log(`    Name: "${parsedResult.name}"`);
          console.log(`    Description: "${parsedResult.description.substring(0, 80)}..."`);
        } else {
          console.log(`    ❌ Parse error: ${parseError}`);
        }
      } else {
        const result = {
          testNumber: task.testNumber,
          model: task.model,
          success: false,
          responseTime,
          error: llmResult.error,
          rawResponse: null,
          parsedResult: null,
          parseError: null,
          usage: null,
        };

        results.push(result);
        console.log(`  ❌ Failed (${responseTime}ms): ${llmResult.error}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result = {
        testNumber: task.testNumber,
        model: task.model,
        success: false,
        responseTime,
        error: error.message,
        rawResponse: null,
        parsedResult: null,
        parseError: null,
        usage: null,
      };

      results.push(result);
      console.log(`  ❌ Exception (${responseTime}ms): ${error.message}`);
    }
  }

  // Запускаем задачи параллельно с контролем количества одновременных запросов
  let taskIndex = 0;

  while (taskIndex < tasks.length || executing.size > 0) {
    // Запускаем новые задачи, если есть свободные слоты
    while (executing.size < parallelismLevel && taskIndex < tasks.length) {
      const task = tasks[taskIndex++];

      // Ступенчатый запуск для равномерного распределения нагрузки
      const staggerDelay = useStaggered ? executing.size * requestDelay : 0;

      const promise = executeTask(task, staggerDelay).finally(() => {
        executing.delete(promise);
      });

      executing.add(promise);

      // Небольшая задержка между запусками задач
      if (taskIndex < tasks.length) {
        await new Promise((resolve) => setTimeout(resolve, requestDelay));
      }
    }

    // Ждем завершения хотя бы одной задачи
    if (executing.size > 0) {
      await Promise.race(executing);
    }
  }

  // Сортируем результаты по номеру теста
  return results.sort((a, b) => a.testNumber - b.testNumber);
}

// Улучшенная функция парсинга JSON с дополнительными стратегиями
function parseJSONWithFallbackAdvanced(rawResponse) {
  // Стратегия 1: Чистый JSON
  try {
    return JSON.parse(rawResponse);
  } catch (e1) {
    console.log(`❌ Strategy 1 failed: ${e1.message}`);
  }

  // Стратегия 2: Удаление markdown блоков
  try {
    const cleanedResponse = rawResponse
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/m, '')
      .trim();

    console.log(`🔄 Trying Strategy 2 with cleaned response: ${cleanedResponse.substring(0, 50)}...`);
    return JSON.parse(cleanedResponse);
  } catch (e2) {
    console.log(`❌ Strategy 2 failed: ${e2.message}`);
  }

  // Стратегия 3: Извлечение JSON регулярными выражениями (более агрессивный поиск)
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*?\}(?=\s*(?:```|$))/m);
    if (jsonMatch) {
      console.log(`🔄 Trying Strategy 3 with extracted JSON: ${jsonMatch[0].substring(0, 50)}...`);
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e3) {
    console.log(`❌ Strategy 3 failed: ${e3.message}`);
  }

  // Стратегия 4: Поиск между первой { и последней }
  try {
    const firstBrace = rawResponse.indexOf('{');
    const lastBrace = rawResponse.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const extractedJson = rawResponse.substring(firstBrace, lastBrace + 1);
      console.log(`🔄 Trying Strategy 4 with extracted JSON: ${extractedJson.substring(0, 50)}...`);
      return JSON.parse(extractedJson);
    }
  } catch (e4) {
    console.log(`❌ Strategy 4 failed: ${e4.message}`);
  }

  // Стратегия 5: Построчный поиск JSON объекта
  try {
    const lines = rawResponse.split('\n');
    const startIdx = lines.findIndex((line) => line.trim().includes('{'));
    const endIdx = lines.findLastIndex((line) => line.trim().includes('}'));

    if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
      const jsonLines = lines.slice(startIdx, endIdx + 1);
      const reconstructedJson = jsonLines.join('\n');
      console.log(`🔄 Trying Strategy 5 with reconstructed JSON: ${reconstructedJson.substring(0, 50)}...`);
      return JSON.parse(reconstructedJson);
    }
  } catch (e5) {
    console.log(`❌ Strategy 5 failed: ${e5.message}`);
  }

  throw new Error(`All parsing strategies failed for response: ${rawResponse.substring(0, 200)}...`);
}

export async function getCatalogueSample(request, reply) {
  try {
    const limit = Math.min(request.query.limit || 10, 50);

    const allEntries = await dbFood.getAllFoodCatalogueEntries();

    if (!allEntries || allEntries.length === 0) {
      return reply.send({
        result: true,
        entries: [],
        totalCount: 0,
      });
    }

    const sampleEntries = allEntries.slice(0, limit).map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.descriptionForEmbedding,
      hasDescription: !!(entry.descriptionForEmbedding && entry.descriptionForEmbedding.trim().length > 0),
      previewInput: `${entry.name}${
        entry.descriptionForEmbedding ? ` - ${entry.descriptionForEmbedding.substring(0, 100)}...` : ''
      }`,
    }));

    console.log(`📋 Returning ${sampleEntries.length} catalogue entries for prompt testing`);

    return reply.send({
      result: true,
      entries: sampleEntries,
      totalCount: allEntries.length,
    });
  } catch (error) {
    console.error('❌ Debug getCatalogueSample error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function getTestConfig(request, reply) {
  try {
    const config = {
      systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
      models: AI_FOOD_DESCRIPTION_MODELS,
      matrixSize: {
        totalModels: AI_FOOD_DESCRIPTION_MODELS.length,
        totalTests: AI_FOOD_DESCRIPTION_MODELS.length,
      },
    };

    console.log(
      `📋 Matrix testing config: ${config.matrixSize.totalPrompts} prompts × ${config.matrixSize.totalModels} models = ${config.matrixSize.totalTests} tests`
    );

    return reply.send({
      result: true,
      config,
    });
  } catch (error) {
    console.error('❌ Debug getTestConfig error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function enrichCatalogueNames(request, reply) {
  try {
    const count = Math.min(request.query.count || 1, 100);
    const results = [];
    let processed = 0;

    console.log(`🎯 Starting catalogue names enrichment: ${count} entries with empty embedding`);

    for (let i = 0; i < count; i++) {
      const allEntries = await dbFood.getAllFoodCatalogueEntries();

      // Сортируем по ID и находим первую запись с пустым embedding (исключаем конфликтные)
      const entriesWithoutEmbedding = allEntries
        .filter((entry) => !entry.embedding || entry.embedding === null || entry.embedding === '')
        .filter((entry) => !entry.embedding || !entry.embedding.startsWith('conflicted:'))
        .sort((a, b) => a.id - b.id);

      const entryWithoutEmbedding = entriesWithoutEmbedding[0];

      if (!entryWithoutEmbedding) {
        console.log(
          `✅ Batch enrichment completed: ${processed}/${count} entries processed (no more entries need enrichment)`
        );
        break;
      }

      console.log(
        `📊 Progress: ${i + 1}/${count} - Processing entry ${entryWithoutEmbedding.id}: "${entryWithoutEmbedding.name}"`
      );

      const result = await enrichSingleCatalogueName(entryWithoutEmbedding);
      results.push(result);

      if (result.result) {
        processed++;
        console.log(`✅ Successfully enriched entry ${entryWithoutEmbedding.id}`);
      } else {
        console.log(`❌ Failed to enrich entry ${entryWithoutEmbedding.id}: ${result.error}`);
      }

      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`🏁 Names enrichment finished: ${processed}/${count} entries successfully processed\n\n\n`);

    return reply.send({
      result: true,
      batchProcessing: true,
      processedCount: processed,
      requestedCount: count,
      results: results,
    });
  } catch (error) {
    console.error('❌ Debug enrichCatalogueNames error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

export async function enrichCatalogueNameById(request, reply) {
  try {
    const catalogueId = parseInt(request.params.id);
    if (!catalogueId || isNaN(catalogueId)) {
      return reply.code(400).send({
        result: false,
        error: 'Invalid catalogue ID',
      });
    }

    console.log(`🎯 Starting single entry name enrichment for ID: ${catalogueId}`);

    const allEntries = await dbFood.getAllFoodCatalogueEntries();
    const catalogueEntry = allEntries.find((e) => e.id === catalogueId);

    if (!catalogueEntry) {
      return reply.code(404).send({
        result: false,
        error: 'Catalogue entry not found',
      });
    }

    // Проверяем, не помечена ли запись как конфликтная
    if (catalogueEntry.embedding && catalogueEntry.embedding.startsWith('conflicted:')) {
      return reply.send({
        result: false,
        error: 'Entry is marked as conflicted',
        catalogueEntry: {
          id: catalogueEntry.id,
          originalName: catalogueEntry.name,
          originalDescription: catalogueEntry.descriptionForEmbedding,
          embeddingStatus: catalogueEntry.embedding,
        },
        skipReason: 'Previously marked as conflicted due to naming conflicts',
      });
    }

    const result = await enrichSingleCatalogueName(catalogueEntry);
    return reply.send(result);
  } catch (error) {
    console.error('❌ Debug enrichCatalogueNameById error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

async function enrichSingleCatalogueName(catalogueEntry) {
  try {
    console.log(`🔄 Enriching names for catalogue entry ${catalogueEntry.id}: "${catalogueEntry.name}"`);

    const originalInput = `${catalogueEntry.name}${
      catalogueEntry.descriptionForEmbedding ? ` - ${catalogueEntry.descriptionForEmbedding}` : ''
    }`;
    console.log(`📝 Original input: "${originalInput}"`);

    const userPrompt = AI_FOOD_DESCRIPTION_USER_PROMPT.replace('{originalName}', catalogueEntry.name).replace(
      '{originalDescription}',
      catalogueEntry.descriptionForEmbedding || ''
    );

    for (const model of AI_FOOD_DESCRIPTION_MODELS) {
      console.log(`🤖 Trying model: ${model}`);

      const startTime = Date.now();
      const llmResult = await callOpenRouterAPI({
        model: model,
        systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
        userPrompt: userPrompt,
      });
      const responseTime = Date.now() - startTime;

      if (!llmResult.success) {
        console.log(`  ❌ Model ${model} failed (${responseTime}ms): ${llmResult.error}`);
        continue;
      }

      console.log(`  ✅ Model ${model} responded (${responseTime}ms)`);

      const parsedResult = parseJSONWithMultipleStrategies(llmResult.data.content);

      if (parsedResult.success && parsedResult.data.name && parsedResult.data.description) {
        console.log(`  ✅ Successfully parsed JSON`);
        console.log(`    New name: "${parsedResult.data.name}"`);
        console.log(`    New description: "${parsedResult.data.description.substring(0, 100)}..."`);

        const updateResult = await dbFood.updateCatalogueEntryNameAndDescription(
          catalogueEntry.id,
          parsedResult.data.name,
          parsedResult.data.description
        );

        if (updateResult.success) {
          console.log(`✅ Successfully updated catalogue entry ${catalogueEntry.id} in database`);
          return {
            result: true,
            catalogueEntry: {
              id: catalogueEntry.id,
              originalName: catalogueEntry.name,
              originalDescription: catalogueEntry.descriptionForEmbedding,
              originalInput,
            },
            enrichmentResult: {
              usedModel: model,
              responseTime,
              newName: parsedResult.data.name,
              newDescription: parsedResult.data.description,
              dbUpdateSuccess: true,
            },
          };
        } else if (updateResult.error === 'DUPLICATE_NAME') {
          console.log(`⚠️  Name conflict for entry ${catalogueEntry.id}: "${parsedResult.data.name}" already exists`);
          console.log(`🏷️  Marking entry as conflicted and skipping to next model...`);

          // Пробуем следующую модель, может она предложит другое название
          continue;
        } else {
          console.log(`❌ Database error for entry ${catalogueEntry.id}: ${updateResult.sqliteError}`);
          return {
            result: false,
            error: `Database error: ${updateResult.error}`,
            catalogueEntry: {
              id: catalogueEntry.id,
              originalName: catalogueEntry.name,
              originalDescription: catalogueEntry.descriptionForEmbedding,
              originalInput,
            },
            enrichmentResult: {
              usedModel: model,
              responseTime,
              newName: parsedResult.data.name,
              newDescription: parsedResult.data.description,
              dbUpdateSuccess: false,
              errorDetails: updateResult.sqliteError,
            },
          };
        }
      } else {
        console.log(`  ❌ Failed to parse JSON from model ${model}: ${parsedResult.error}`);
        console.log(`    Raw response: ${llmResult.data.content.substring(0, 200)}...`);
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    console.log(`❌ All models failed for entry ${catalogueEntry.id}`);
    console.log(`🏷️  Marking entry ${catalogueEntry.id} as conflicted due to repeated naming conflicts`);

    // Помечаем запись как конфликтную, чтобы не пытаться её обработать снова
    const markResult = await dbFood.markCatalogueEntryAsConflicted(catalogueEntry.id, 'naming_conflicts');

    return {
      result: false,
      error: 'All models failed - likely due to naming conflicts',
      catalogueEntry: {
        id: catalogueEntry.id,
        originalName: catalogueEntry.name,
        originalDescription: catalogueEntry.descriptionForEmbedding,
        originalInput,
      },
      markedAsConflicted: markResult,
    };
  } catch (error) {
    console.error('❌ Error enriching single catalogue name:', error);
    return {
      result: false,
      error: error.message,
    };
  }
}

function parseJSONWithMultipleStrategies(rawResponse) {
  console.log(`🔄 Attempting to parse JSON with multiple strategies...`);

  const strategies = [
    {
      name: 'Clean JSON',
      fn: (response) => JSON.parse(response),
    },
    {
      name: 'Remove markdown blocks',
      fn: (response) => {
        const cleaned = response
          .replace(/^```(?:json)?\s*/im, '')
          .replace(/```\s*$/m, '')
          .trim();
        return JSON.parse(cleaned);
      },
    },
    {
      name: 'Extract JSON with regex',
      fn: (response) => {
        const match = response.match(/\{[\s\S]*?\}(?=\s*(?:```|$))/m);
        if (!match) throw new Error('No JSON found');
        return JSON.parse(match[0]);
      },
    },
    {
      name: 'Extract between first and last braces',
      fn: (response) => {
        const firstBrace = response.indexOf('{');
        const lastBrace = response.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
          throw new Error('No valid JSON braces found');
        }
        const extracted = response.substring(firstBrace, lastBrace + 1);
        return JSON.parse(extracted);
      },
    },
    {
      name: 'Line-by-line reconstruction',
      fn: (response) => {
        const lines = response.split('\n');
        const startIdx = lines.findIndex((line) => line.trim().includes('{'));
        const endIdx = lines.findLastIndex((line) => line.trim().includes('}'));
        if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
          throw new Error('No valid JSON structure found');
        }
        const reconstructed = lines.slice(startIdx, endIdx + 1).join('\n');
        return JSON.parse(reconstructed);
      },
    },
  ];

  for (const strategy of strategies) {
    try {
      console.log(`  🔄 Trying strategy: ${strategy.name}`);
      const result = strategy.fn(rawResponse);

      if (!result.name || !result.description) {
        console.log(`  ❌ Strategy ${strategy.name}: Missing required fields`);
        continue;
      }

      console.log(`  ✅ Strategy ${strategy.name}: Success`);
      return {
        success: true,
        data: result,
        usedStrategy: strategy.name,
      };
    } catch (error) {
      console.log(`  ❌ Strategy ${strategy.name}: ${error.message}`);
    }
  }

  return {
    success: false,
    error: `All ${strategies.length} parsing strategies failed`,
    rawResponse: rawResponse.substring(0, 200) + '...',
  };
}
