import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as dbFood from '../../db/db-food.js';
import { AI_PROVIDERS } from '../../env.js';
import * as aiService from '../ai/ai-service.js';
import * as debugService from './debug-service.js';

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
          console.warn(`File ${filename} contains invalid data, starting fresh`);
          existingData = [];
        }
      } catch (parseError) {
        console.warn(`Failed to parse existing file ${filename}, starting fresh:`, parseError.message);
        existingData = [];
      }
    }

    existingData.push(resultEntry);

    writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');

    console.log(`💾 Enrichment result saved to: backups/${filename}`);
    console.log(`📊 Total entries in file: ${existingData.length}`);

    return { success: true, filename, totalEntries: existingData.length, filePath: `backups/${filename}` };
  } catch (error) {
    console.error('Failed to save enrichment result:', error);
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
    console.error('Failed to get git info:', error);
  }

  return { commitHash, commitDateTime };
}

export async function testLlm(request, reply) {
  try {
    if (!aiService.isAiEnabled()) {
      return reply.code(503).send({
        result: false,
        error: 'LLM service is disabled',
      });
    }

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
    console.error('Debug LLM test error:', error);
    return reply.code(500).send({
      result: false,
      error: 'Internal server error',
    });
  }
}

export async function enrichCatalogueEntries(request, reply) {
  try {
    if (!aiService.isAiEnabled()) return;

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
    console.error('Debug enrichCatalogueEntry error:', error);
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
        console.log(`  🎯 Confidence: ${result.data.confidence}`);
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

      const totalConfidence = filteredResults.reduce((sum, r) => sum + r.data.confidence, 0);

      weightedAverage = {
        kcals: filteredResults.reduce((sum, r) => sum + r.data.kcals * r.data.confidence, 0) / totalConfidence,
        protein: filteredResults.reduce((sum, r) => sum + r.data.protein * r.data.confidence, 0) / totalConfidence,
        fat: filteredResults.reduce((sum, r) => sum + r.data.fat * r.data.confidence, 0) / totalConfidence,
        carbs: filteredResults.reduce((sum, r) => sum + r.data.carbs * r.data.confidence, 0) / totalConfidence,
        fiber: filteredResults.reduce((sum, r) => sum + r.data.fiber * r.data.confidence, 0) / totalConfidence,
        averageConfidence: totalConfidence / filteredResults.length,
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

      console.log(`\n📊 Weighted Average (by confidence):`);
      console.log(`  🍎 KBJU: ${weightedAverage.kcals.toFixed(1)}kcal, P:${weightedAverage.protein.toFixed(1)}g, F:${weightedAverage.fat.toFixed(1)}g, C:${weightedAverage.carbs.toFixed(1)}g, Fiber:${weightedAverage.fiber.toFixed(1)}g`); // prettier-ignore
      console.log(`  🎯 Average confidence: ${weightedAverage.averageConfidence.toFixed(3)}`);
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
    console.error('Debug enrichSingleCatalogueEntry error:', error);
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
    console.error('Debug listCatalogueEntries error:', error);
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
        Authorization: `Bearer ${AI_PROVIDERS.TEXT_GEN.API_KEY}`,
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
    console.error('Error checking rate limits:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}

// ============================================================================================ EMBEDDING ENRICHMENT ===

export async function enrichCatalogueEmbeddings(request, reply) {
  try {
    if (!aiService.isAiEnabled()) {
      return reply.code(503).send({
        result: false,
        error: 'AI service is disabled',
      });
    }

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
    console.error('Debug enrichCatalogueEmbeddings error:', error);
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
    console.error('Error enriching single catalogue embedding:', error);
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
          console.warn(`File ${filename} contains invalid data, starting fresh`);
          existingData = [];
        }
      } catch (parseError) {
        console.warn(`Failed to parse existing file ${filename}, starting fresh:`, parseError.message);
        existingData = [];
      }
    }

    existingData.push(resultEntry);

    writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');

    console.log(`💾 Embedding result saved to: backups/${filename}`);
    console.log(`📊 Total entries in file: ${existingData.length}`);

    return { success: true, filename, totalEntries: existingData.length, filePath: `backups/${filename}` };
  } catch (error) {
    console.error('Failed to save embedding result:', error);
    return { success: false, error: error.message };
  }
}

export async function searchByEmbedding(request, reply) {
  try {
    if (!aiService.isAiEnabled()) {
      return reply.code(503).send({
        result: false,
        error: 'AI service is disabled',
      });
    }

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
    console.error('Debug searchByEmbedding error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}
