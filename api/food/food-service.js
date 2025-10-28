import * as dbFood from '../../db/db-food.js';
import { FOOD_SEARCH_DESCRIPTION_WEIGHT, FOOD_SEARCH_NAME_WEIGHT } from '../../env.js';
import { tempPerfLog } from '../../perf-logger.js';
import * as utils from '../../utils/utils.js';
import * as aiService from '../ai/ai-service.js';
import * as imageCache from '../ai/image-cache.js';
import * as imageService from '../ai/image-service.js';
import * as statsCache from './stats-cache.js';

export function getDateRange(dateIso, fetchDaysRangeOffset) {
  const date = new Date(dateIso);
  const result = [];
  for (let i = -fetchDaysRangeOffset; i <= fetchDaysRangeOffset; i++) {
    const d = new Date(date);
    d.setDate(date.getDate() + i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

export function organizeByDatesAndIds(inboundList) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const date = food.dateISO;
    const id = food.id;
    if (!resultDict[date]) {
      resultDict[date] = {};
    }
    resultDict[date][id] = {
      id: food.id,
      foodCatalogueId: food.foodCatalogueId,
      foodWeight: food.foodWeight,
      dateISO: date,
      history: parseHistory(food.history),
    };
  });
  return resultDict;
}

function parseHistory(historyStr) {
  try {
    return JSON.parse(historyStr) ?? [];
  } catch {
    return [];
  }
}

export function extendDiary(targetDict, propertyName, value, defaultValue) {
  for (const date in targetDict) {
    targetDict[date][propertyName] = value[date] || defaultValue;
  }
  return targetDict;
}

export function organizeWeightsByDate(arrayOfWeights) {
  const resultDict = {};
  arrayOfWeights.forEach((weightObj) => {
    resultDict[weightObj.dateISO] = weightObj.weight;
  });
  return resultDict;
}

export async function formFoodCatalogue() {
  const foodCatalogueRaw = await dbFood.getAllFoodCatalogueEntriesForAPI();
  const foodCataloguePrepped = prepFoodCatalogue(foodCatalogueRaw);
  return foodCataloguePrepped;
}

function prepFoodCatalogue(catalogueArray) {
  const catalogueObj = {};
  for (const entry of catalogueArray) {
    catalogueObj[entry.id] = {
      ...entry,
      imageVersion: imageCache.getImageVersion(entry.id) || undefined,
    };
  }
  return catalogueObj;
}

export async function makeUpdatedHistoryString(diaryId, userId, newHistoryEntry) {
  const resHistory = await dbFood.dbGetDiaryEntriesHistory(diaryId, userId);
  const updatedHistory = resHistory.length ? JSON.parse(resHistory[0].history) : [];
  updatedHistory.push(newHistoryEntry);
  const historyString = JSON.stringify(updatedHistory);
  return historyString;
}

export async function calculateTargetKcals(userId, endDate) {
  const DAYS_AVG_7 = 7;
  const DAYS_AVG_60 = 60;
  const KCALS_IN_1_KG = 7700;

  const startDate = await dbFood.getUserFirstDate(userId);
  if (!startDate) throw new Error('No user data found');

  const diaryHistory = await dbFood.getDiaryEntriesHistory(userId, startDate, endDate);
  const weightHistory = await dbFood.getWeightHistory(userId, startDate, endDate);

  const dailyKcals = {};
  const dailyWeights = {};
  const targetKcals = {};
  const smoothedTargetKcals = {};

  weightHistory.forEach((entry) => {
    dailyWeights[entry.dateISO] = entry.weight;
  });

  diaryHistory.forEach((entry) => {
    if (!dailyKcals[entry.dateISO]) {
      dailyKcals[entry.dateISO] = 0;
    }
    dailyKcals[entry.dateISO] += (entry.foodWeight / 100) * entry.kcals;
  });

  const dates = Object.keys(dailyKcals).sort();

  for (let i = DAYS_AVG_7; i < dates.length; i++) {
    const currentDate = dates[i];
    const startIdx = i - DAYS_AVG_7;

    if (dailyWeights[currentDate] && dailyWeights[dates[startIdx]]) {
      const weightDiff = dailyWeights[currentDate] - dailyWeights[dates[startIdx]];
      const kcalsInPeriod = dates.slice(startIdx, i + 1).reduce((sum, date) => sum + (dailyKcals[date] || 0), 0);

      const avgDailyKcals = (kcalsInPeriod - weightDiff * KCALS_IN_1_KG) / DAYS_AVG_7;
      targetKcals[currentDate] = Math.round(avgDailyKcals);
    }
  }

  for (let i = DAYS_AVG_60; i < dates.length; i++) {
    const currentDate = dates[i];
    const startIdx = i - DAYS_AVG_60;

    const kcalsToAverage = dates
      .slice(startIdx, i + 1)
      .filter((date) => targetKcals[date])
      .map((date) => targetKcals[date]);

    if (kcalsToAverage.length > 0) {
      const avgKcals = kcalsToAverage.reduce((sum, kcals) => sum + kcals, 0) / kcalsToAverage.length;
      smoothedTargetKcals[currentDate] = Math.round(avgKcals);
    }
  }

  return smoothedTargetKcals;
}

// =========================================================================================================== STATS ===

export async function getStats(userId) {
  const cachedStats = statsCache.getCachedStats(userId);

  if (!cachedStats) {
    const newStats = await calculateStats(userId);
    if (Object.keys(newStats).length) {
      statsCache.saveCachedStats(userId, newStats);
    }
    return newStats;
  }

  return JSON.parse(cachedStats.stats);
}

export async function recalculateStats(userId) {
  try {
    const stats = await calculateStats(userId);

    if (Object.keys(stats).length) {
      statsCache.saveCachedStats(userId, stats);
    }

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function calculateStats(userId) {
  try {
    const firstDate = await dbFood.getUserFirstDate(userId);
    const lastDate = new Date().toISOString().split('T')[0];
    if (!firstDate) return {};

    const allDates = getDatesList(firstDate, lastDate);

    const weightsRaw = await dbFood.getWeightHistory(userId, firstDate, lastDate);
    const weightsPrepped = prepareWeights(weightsRaw, allDates);

    const diaryEntriesRaw = await dbFood.getDiaryEntriesHistory(userId, firstDate, lastDate);
    const diaryEntriesPrepped = prepareDiaryEntries(diaryEntriesRaw, allDates);

    const coefficients = await getCoefficients(userId);
    const dailySumKcals = calculateDailySumKcals(diaryEntriesPrepped, coefficients, allDates);

    const avgDays = 10;
    const dailySumKcalsAvg = calculateCenteredAverage(dailySumKcals, avgDays, true, 0);
    const weightsPrepAvg = calculateCenteredAverage(weightsPrepped, avgDays, true, 1);

    const normDays = 30;
    const targetKcals = computeTargetKcalsFromHistory(dailySumKcalsAvg, weightsPrepAvg, normDays);
    const targetKcalsAvg = calculateCenteredAverage(targetKcals, normDays, true, 0);

    const preparedStats = prepareStats(allDates, weightsPrepped, weightsPrepAvg, dailySumKcals, targetKcalsAvg);
    return preparedStats;
  } catch (error) {
    console.error(error);
    return {};
  }
}

function getDatesList(dateIsoFirst, dateIsoLast) {
  const dateFirst = utils.createUtcDateFromIsoString(dateIsoFirst);
  const dateLast = utils.createUtcDateFromIsoString(dateIsoLast);
  const daysAmt = Math.floor((dateLast - dateFirst) / (1000 * 60 * 60 * 24)) + 1;
  const datesList = [];
  const currentDate = dateFirst;

  for (let dayIndex = 0; dayIndex < daysAmt; dayIndex++) {
    const nextDate = new Date(currentDate.getTime());
    nextDate.setUTCDate(currentDate.getUTCDate() + dayIndex);
    const formattedDate = nextDate.toISOString().split('T')[0];
    datesList.push(formattedDate);
  }

  return datesList;
}

function prepareWeights(weightsRaw, allDates) {
  const weights = Object.fromEntries(allDates.map((date) => [date, null]));

  weightsRaw.forEach((item) => {
    weights[item.dateISO] = parseFloat(item.weight);
  });

  return weights;
}

function prepareDiaryEntries(diaryEntriesRaw, allDates) {
  const entries = Object.fromEntries(allDates.map((date) => [date, null]));

  diaryEntriesRaw.forEach((row) => {
    if (!entries[row.dateISO]) {
      entries[row.dateISO] = [];
    }
    entries[row.dateISO].push({
      foodId: row.foodCatalogueId,
      weight: row.foodWeight,
      calories: row.kcals,
    });
  });

  return entries;
}

function calculateDailySumKcals(diaryEntries, coefficients, allDates) {
  const dailySumKcals = Object.fromEntries(allDates.map((date) => [date, null]));

  for (const [date, entries] of Object.entries(diaryEntries)) {
    if (entries === null) continue;

    dailySumKcals[date] = 0;

    for (const { foodId, weight, calories } of entries) {
      dailySumKcals[date] += (weight / 100) * calories * coefficients[foodId];
    }
  }

  return dailySumKcals;
}

export async function getCoefficients(userId) {
  const useCoeffs = true; // TODO[067]: Force enabled for now, implement in settings
  if (!useCoeffs) {
    return await makeOnesForCoefficients();
  }

  return await getAndValidateCoefficients(userId);
}

async function makeOnesForCoefficients() {
  const catalogueEntries = await dbFood.getAllFoodCatalogueEntries();
  return Object.fromEntries(catalogueEntries.map((item) => [item.id, 1.0]));
}

async function getAndValidateCoefficients(userId) {
  const catalogueEntries = await dbFood.getAllFoodCatalogueEntries();
  const coeffsResult = await dbFood.getUsersCoefficients(userId);

  let usersCoeffs = {};
  try {
    if (coeffsResult && coeffsResult.coefficients) {
      usersCoeffs = JSON.parse(coeffsResult.coefficients);
    }
    const catalogueIdsSet = new Set(catalogueEntries.map((item) => item.id));
    const usersCoeffsIdsSet = new Set(Object.keys(usersCoeffs).map(Number));

    if (catalogueIdsSet.size > usersCoeffsIdsSet.size) {
      for (const id of catalogueIdsSet) {
        if (!usersCoeffsIdsSet.has(id)) {
          usersCoeffs[id] = 1.0;
        }
      }
      await dbFood.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    }

    if (usersCoeffsIdsSet.size > catalogueIdsSet.size) {
      for (const id of usersCoeffsIdsSet) {
        if (!catalogueIdsSet.has(id)) {
          delete usersCoeffs[id];
        }
      }
      await dbFood.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    }
  } catch (error) {
    usersCoeffs = Object.fromEntries(catalogueEntries.map((item) => [item.id, 1.0]));
    await dbFood.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
  }

  return usersCoeffs;
}

function calculateSimpleAverage(inputDict, avgRange, roundBool = false, roundPlaces = 0) {
  const keys = Object.keys(inputDict);
  const values = Object.values(inputDict);

  for (let i = 1; i < values.length; i++) {
    if (values[i] === null) {
      values[i] = values[i - 1];
    }
  }

  const averaged = values.map((_, i) => {
    const start = Math.max(0, i - avgRange + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

    if (roundBool) {
      return roundPlaces > 0 ? Number(avg.toFixed(roundPlaces)) : Math.round(avg);
    }
    return avg;
  });

  return Object.fromEntries(keys.map((k, i) => [k, averaged[i]]));
}

function calculateCenteredAverage(inputDict, avgRange, roundBool = false, roundPlaces = 0) {
  const keys = Object.keys(inputDict);
  const values = Object.values(inputDict);

  for (let i = 1; i < values.length; i++) {
    if (values[i] === null) {
      values[i] = values[i - 1];
    }
  }

  const halfRange = Math.floor(avgRange / 2);

  const averaged = values.map((_, i) => {
    const start = Math.max(0, i - halfRange);
    const end = Math.min(values.length, i + halfRange + 1);

    const slice = values.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

    if (roundBool) {
      return roundPlaces > 0 ? Number(avg.toFixed(roundPlaces)) : Math.round(avg);
    }
    return avg;
  });

  return Object.fromEntries(keys.map((k, i) => [k, averaged[i]]));
}

function computeTargetKcalsFromHistory(kcals, weights, n) {
  const kcalsKeys = Object.keys(kcals);
  const kcalsValues = Object.values(kcals);
  const weightsValues = Object.values(weights);
  const averaged = [];

  for (let i = n - 1; i < kcalsValues.length; i++) {
    const kcalsSlice = kcalsValues.slice(i - n + 1, i + 1);
    const weightDiff = weightsValues[i] - weightsValues[i - n + 1];
    const totalCaloriesConsumedInNDays = utils.sumArray(kcalsSlice);
    const calorieDeficitFromWeight = weightDiff * 7700;
    const dailyMaintenanceCalories = (totalCaloriesConsumedInNDays - calorieDeficitFromWeight) / n;
    averaged.push(dailyMaintenanceCalories);
  }

  const resultKeys = kcalsKeys.slice(kcalsKeys.length - averaged.length);

  return Object.fromEntries(resultKeys.map((k, i) => [k, averaged[i]]));
}

function prepareStats(allDates, weights, avgWeights, dailySumKcals, targetKcalsAvg) {
  const stats = {};

  allDates.forEach((day) => {
    stats[day] = [weights[day], avgWeights[day], dailySumKcals[day], targetKcalsAvg[day]];
  });

  return stats;
}

// ================================================================================================= SEMANTIC SEARCH ===

/**
 * Performs semantic search across all catalogue entries using vector embeddings
 * @param {string} query - Search query text
 * @returns {Promise<Array>} Array of matching catalogue entries with relevance scores
 */
export async function searchCatalogueEntries(query) {
  try {
    const embeddingResult = await aiService.generateEmbedding(query);
    if (!embeddingResult.success) {
      console.error('Failed to generate embedding for search:', embeddingResult.error);
      return [];
    }

    const searchResults = await dbFood.searchCatalogueEntriesByEmbedding(
      embeddingResult.data.embedding,
      embeddingResult.data.embedding,
      FOOD_SEARCH_NAME_WEIGHT,
      FOOD_SEARCH_DESCRIPTION_WEIGHT
    );

    return searchResults.map((result) => ({
      ...result,
      relevanceScore: 1 - result.distance,
    }));
  } catch (error) {
    console.error('Error in semantic search:', error);
    return [];
  }
}

// ============================================================================================ GENERALIZED PRODUCTS ===

/**
 * Generates product preview data using LLM analysis without database creation
 * @param {string} description - User's free-form product description
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>} Generated product data
 */
export async function generateProductPreviewData(description) {
  try {
    const llmResult = await aiService.generateGeneralizedProduct(description);

    if (!llmResult.success) {
      return {
        success: false,
        error: llmResult.error,
      };
    }

    return {
      success: true,
      data: {
        generalizedName: llmResult.data.generalizedName,
        kcals: llmResult.data.kcals,
        protein: llmResult.data.protein,
        fat: llmResult.data.fat,
        carbs: llmResult.data.carbs,
        fiber: llmResult.data.fiber,
        description: llmResult.data.description,
      },
    };
  } catch (error) {
    console.error('Error generating product preview:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

/**
 * Universal function for creating or updating catalogue entries
 * @param {number|null} id - Catalogue entry ID (null for create, number for update)
 * @param {Object} productData - Complete product information
 * @param {string} productData.name - Product name (1-100 characters)
 * @param {number} productData.kcals - Calories per 100g (0-1000)
 * @param {number} productData.protein - Protein per 100g (0-100)
 * @param {number} productData.fat - Fat per 100g (0-100)
 * @param {number} productData.carbs - Carbs per 100g (0-100)
 * @param {number} productData.fiber - Fiber per 100g (0-50)
 * @param {string} productData.description - Product description (1-2000 characters)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>} Created/updated entry or error
 */
export async function saveProductData(id, productData) {
  try {
    const { name, kcals, protein, fat, carbs, fiber, description } = productData;

    if (
      !name ||
      kcals === undefined ||
      protein === undefined ||
      fat === undefined ||
      carbs === undefined ||
      fiber === undefined ||
      !description
    ) {
      return {
        success: false,
        error: 'Missing required fields',
      };
    }

    if (kcals < 0 || kcals > 1000) {
      return {
        success: false,
        error: 'Calories must be between 0 and 1000',
      };
    }

    if (protein < 0 || protein > 100 || fat < 0 || fat > 100 || carbs < 0 || carbs > 100) {
      return {
        success: false,
        error: 'Protein, fat, and carbs must be between 0 and 100',
      };
    }

    if (fiber < 0 || fiber > 50) {
      return {
        success: false,
        error: 'Fiber must be between 0 and 50',
      };
    }

    if (name.length < 1 || name.length > 100) {
      return {
        success: false,
        error: 'Name must be between 1 and 100 characters',
      };
    }

    if (description.length < 1 || description.length > 2000) {
      return {
        success: false,
        error: 'Description must be between 1 and 2000 characters',
      };
    }

    if (id === null || id === undefined) {
      const existingEntry = await dbFood.getCatalogueEntryByName(name);
      if (existingEntry) {
        return {
          success: false,
          error: 'Product with this name already exists',
        };
      }

      const catalogueId = await dbFood.createCatalogueEntryWithFullNutrition(name, {
        kcals,
        protein,
        fat,
        carbs,
        fiber,
        description,
      });

      if (!catalogueId) {
        return {
          success: false,
          error: 'Failed to create catalogue entry',
        };
      }

      const embeddingNameResult = await aiService.generateEmbedding(name);
      const embeddingDescriptionResult = description ? await aiService.generateEmbedding(description) : null;

      if (embeddingNameResult.success) {
        await dbFood.updateCatalogueEntryEmbedding(
          catalogueId,
          embeddingNameResult.data.embedding,
          embeddingDescriptionResult?.success ? embeddingDescriptionResult.data.embedding : null
        );
      }

      const createdEntry = await dbFood.getCatalogueEntryByIdForAPI(catalogueId);

      imageService.requestProductImageGeneration(catalogueId, name, description);

      return {
        success: true,
        data: {
          catalogueEntry: createdEntry,
        },
      };
    } else {
      const existingEntry = await dbFood.getCatalogueEntryById(id);
      if (!existingEntry) {
        return {
          success: false,
          error: 'Product not found',
        };
      }

      const duplicateEntry = await dbFood.getCatalogueEntryByName(name);
      if (duplicateEntry && duplicateEntry.id !== id) {
        return {
          success: false,
          error: 'Product with this name already exists',
        };
      }

      const updateResult = await dbFood.updateCatalogueEntryFull(
        id,
        name,
        kcals,
        protein,
        fat,
        carbs,
        fiber,
        description
      );

      if (updateResult === false || (updateResult.success === false && updateResult.error === 'DUPLICATE_NAME')) {
        return {
          success: false,
          error: 'Product with this name already exists',
        };
      }

      if (updateResult === false) {
        return {
          success: false,
          error: 'Failed to update catalogue entry',
        };
      }

      const needsEmbeddingUpdate = existingEntry.name !== name || existingEntry.description !== description;

      if (needsEmbeddingUpdate) {
        const embeddingNameResult = await aiService.generateEmbedding(name);
        const embeddingDescriptionResult = description ? await aiService.generateEmbedding(description) : null;

        if (embeddingNameResult.success) {
          await dbFood.updateCatalogueEntryEmbedding(
            id,
            embeddingNameResult.data.embedding,
            embeddingDescriptionResult?.success ? embeddingDescriptionResult.data.embedding : null
          );
        }
      }

      const updatedEntry = await dbFood.getCatalogueEntryByIdForAPI(id);

      return {
        success: true,
        data: {
          catalogueEntry: updatedEntry,
        },
      };
    }
  } catch (error) {
    console.error('Error saving product data:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

export async function createGeneralizedCatalogueEntry(description) {
  try {
    const llmResult = await aiService.generateGeneralizedProduct(description);
    if (!llmResult.success) {
      return {
        success: false,
        error: llmResult.error,
      };
    }

    const productData = llmResult.data;
    const generalizedName = productData.generalizedName;

    const existingEntry = await dbFood.getCatalogueEntryByName(generalizedName);
    let catalogueId;
    let isNew = false;

    if (existingEntry) {
      catalogueId = existingEntry.id;
    } else {
      catalogueId = await dbFood.createCatalogueEntryWithFullNutrition(generalizedName, {
        kcals: productData.kcals,
        protein: productData.protein,
        fat: productData.fat,
        carbs: productData.carbs,
        fiber: productData.fiber,
        description: productData.description,
      });

      if (!catalogueId) {
        return {
          success: false,
          error: 'Failed to create catalogue entry',
        };
      }

      isNew = true;

      const embeddingNameResult = await aiService.generateEmbedding(generalizedName);
      const embeddingDescriptionResult = productData.description
        ? await aiService.generateEmbedding(productData.description)
        : null;

      if (embeddingNameResult.success) {
        await dbFood.updateCatalogueEntryEmbedding(
          catalogueId,
          embeddingNameResult.data.embedding,
          embeddingDescriptionResult?.success ? embeddingDescriptionResult.data.embedding : null
        );
      }
    }

    const fullEntry = existingEntry
      ? { ...existingEntry }
      : await dbFood.getCatalogueEntryByNameForAPI(generalizedName);

    if (fullEntry && fullEntry.description) {
      delete fullEntry.description;
    }

    return {
      success: true,
      data: {
        catalogueEntry: fullEntry,
        isNew: isNew,
      },
    };
  } catch (error) {
    console.error('Error creating generalized catalogue entry:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

// ============================================================================================= MULTIMODAL ANALYSIS ===

/**
 * Analyzes uploaded image to detect food products using AI vision
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<Object>} Analysis result with detected product and search suggestions
 */
export async function analyzeImageForCatalogueEntry(imageBuffer, mimeType) {
  try {
    const analysisResult = await aiService.simpleImageRecognition(imageBuffer, mimeType);
    if (!analysisResult.success) {
      return {
        success: false,
        error: analysisResult.error,
      };
    }

    if (!analysisResult.data || !analysisResult.data.productName) {
      return {
        success: true,
        data: null,
        reason: analysisResult.reason || 'No food product detected in image',
      };
    }

    const productName = analysisResult.data.productName;
    const searchResults = await searchCatalogueEntries(productName);

    return {
      success: true,
      data: {
        detectedProductName: productName,
        searchResults: searchResults,
        searchQuery: productName,
      },
      metadata: analysisResult.metadata,
    };
  } catch (error) {
    console.error('Error analyzing image for catalogue entry:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

/**
 * Analyzes voice transcript to detect food products using AI language processing
 * @param {string} transcript - Voice recognition transcript
 * @returns {Promise<Object>} Analysis result with detected product and search suggestions
 */
export async function analyzeVoiceForCatalogueEntry(transcript) {
  try {
    const analysisResult = await aiService.analyzeVoiceTranscript(transcript);
    if (!analysisResult.success) {
      return {
        success: false,
        error: analysisResult.error,
      };
    }

    const productData = analysisResult.data;
    if (!productData.generalizedName) {
      return {
        success: true,
        data: null,
      };
    }

    const searchResults = await searchCatalogueEntries(productData.generalizedName);

    return {
      success: true,
      data: {
        detectedProduct: productData,
        searchResults: searchResults,
      },
    };
  } catch (error) {
    console.error('Error analyzing voice for catalogue entry:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

// ========================================================================================== REALTIME WEBSOCKET SEARCH ===

/**
 * Performs real-time semantic search for WebSocket with query embedding caching
 * @param {string} query - Search query text
 * @returns {Promise<Array>} Array of matching catalogue entry IDs
 */
export async function searchCatalogueEntriesRealtime(query) {
  const t0 = performance.now();
  try {
    if (!query || query.trim() === '') {
      return [];
    }

    const trimmedQuery = query.trim().toLowerCase();
    let queryEmbedding = null;

    const t1 = performance.now();
    queryEmbedding = await dbFood.getQueryEmbedding(trimmedQuery);
    const t2 = performance.now();
    tempPerfLog(`Cache lookup: ${(t2 - t1).toFixed(2)}ms | hit: ${!!queryEmbedding}`);

    if (!queryEmbedding) {
      const t3 = performance.now();
      const embeddingResult = await aiService.generateEmbedding(trimmedQuery);
      const t4 = performance.now();
      tempPerfLog(`Embedding generation: ${(t4 - t3).toFixed(2)}ms`);

      if (!embeddingResult.success) {
        console.error('Failed to generate embedding for realtime search:', embeddingResult.error);
        return [];
      }

      queryEmbedding = embeddingResult.data.embedding;
      await dbFood.saveQueryEmbedding(trimmedQuery, queryEmbedding);
    }

    const t5 = performance.now();
    const searchResults = await dbFood.searchCatalogueEntriesByEmbedding(
      queryEmbedding,
      queryEmbedding,
      FOOD_SEARCH_NAME_WEIGHT,
      FOOD_SEARCH_DESCRIPTION_WEIGHT
    );
    const t6 = performance.now();
    tempPerfLog(`Vector search: ${(t6 - t5).toFixed(2)}ms | results: ${searchResults.length}`);

    const t7 = performance.now();
    tempPerfLog(`Total search time: ${(t7 - t0).toFixed(2)}ms | query: "${trimmedQuery}"`);
    tempPerfLog(`${'='.repeat(60)}`);
    return searchResults.map((result) => result.id);
  } catch (error) {
    console.error('Error in realtime semantic search:', error);
    return [];
  }
}
