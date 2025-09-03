import * as dbFood from '../../db/db-food.js';
import * as utils from '../../utils/utils.js';
import * as aiService from '../ai/ai-service.js';
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
  const foodCatalogueRaw = await dbFood.getAllFoodCatalogueEntries();
  const foodCataloguePrepped = prepFoodCatalogue(foodCatalogueRaw);
  return foodCataloguePrepped;
}

function prepFoodCatalogue(catalogueArray) {
  const catalogueObj = {};
  for (const entry of catalogueArray) {
    catalogueObj[entry.id] = entry;
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
 * Performs semantic search across user's visible catalogue entries using vector embeddings
 * @param {string} query - Search query text
 * @param {number} userId - User ID for visibility filtering
 * @returns {Promise<Array>} Array of matching catalogue entries with relevance scores
 */
export async function searchCatalogueEntries(query, userId) {
  try {
    if (!aiService.isAiEnabled()) {
      return [];
    }

    const embeddingResult = await aiService.generateEmbedding(query);
    if (!embeddingResult.success) {
      console.error('Failed to generate embedding for search:', embeddingResult.error);
      return [];
    }

    const searchResults = await dbFood.searchCatalogueEntriesByEmbedding(embeddingResult.data.embedding, userId);

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
 * Creates a generalized catalogue entry using LLM analysis of user description
 * @param {string} description - User's free-form product description
 * @param {number} userId - User ID for ownership assignment
 * @returns {Promise<Object>} Result object with success status and created entry data
 */
export async function createGeneralizedCatalogueEntry(description, userId) {
  try {
    if (!aiService.isAiEnabled()) {
      return {
        success: false,
        error: 'LLM service is disabled',
      };
    }

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
        descriptionForEmbedding: productData.descriptionForEmbedding,
      });

      if (!catalogueId) {
        return {
          success: false,
          error: 'Failed to create catalogue entry',
        };
      }

      isNew = true;

      const embeddingResult = await aiService.generateEmbedding(productData.descriptionForEmbedding || generalizedName);
      if (embeddingResult.success) {
        await dbFood.updateCatalogueEntryEmbedding(catalogueId, embeddingResult.data.embedding);
      }
    }

    await dbFood.createUserCatalogueEntryVisibility(userId, catalogueId);

    const fullEntry = existingEntry || (await dbFood.getCatalogueEntryByName(generalizedName));

    return {
      success: true,
      data: {
        catalogueEntry: fullEntry,
        isNew: isNew,
        confidence: productData.confidence,
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

// ================================================================================================== USER CATALOGUE ===

/**
 * Adds a catalogue entry to user's personal visibility list
 * @param {number} userId - User ID
 * @param {number} catalogueId - Catalogue entry ID to add
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function addCatalogueEntryToUserVisibility(userId, catalogueId) {
  try {
    const success = await dbFood.createUserCatalogueEntryVisibility(userId, catalogueId);
    return {
      success: success,
      message: success ? 'Product added to personal catalogue' : 'Product already in personal catalogue',
    };
  } catch (error) {
    console.error('Error adding catalogue entry to user visibility:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

/**
 * Removes a catalogue entry from user's personal visibility list
 * @param {number} userId - User ID
 * @param {number} catalogueId - Catalogue entry ID to remove
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function removeCatalogueEntryFromUserVisibility(userId, catalogueId) {
  try {
    const success = await dbFood.removeUserCatalogueEntryVisibility(userId, catalogueId);
    return {
      success: success,
      message: success ? 'Product removed from personal catalogue' : 'Product was not in personal catalogue',
    };
  } catch (error) {
    console.error('Error removing catalogue entry from user visibility:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

/**
 * Retrieves user's personal catalogue with all visible entries
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Result object with success status and user's catalogue data
 */
export async function getUserPersonalCatalogue(userId) {
  try {
    const entries = await dbFood.getUserVisibleCatalogueEntries(userId);
    return {
      success: true,
      data: entries,
    };
  } catch (error) {
    console.error('Error getting user personal catalogue:', error);
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
 * @param {number} userId - User ID for search filtering
 * @returns {Promise<Object>} Analysis result with detected product and search suggestions
 */
export async function analyzeImageForCatalogueEntry(imageBuffer, mimeType, userId) {
  try {
    if (!aiService.isAiEnabled()) {
      return {
        success: false,
        error: 'LLM service is disabled',
      };
    }

    const recognitionResult = await aiService.simpleImageRecognition(imageBuffer, mimeType);
    if (!recognitionResult.success) {
      return {
        success: false,
        error: recognitionResult.error,
      };
    }

    if (!recognitionResult.data || !recognitionResult.data.productName) {
      return {
        success: true,
        data: null,
        reason: recognitionResult.reason || 'No food product detected in image',
      };
    }

    const productName = recognitionResult.data.productName;
    const searchResults = await searchCatalogueEntries(productName, userId);

    return {
      success: true,
      data: {
        detectedProductName: productName,
        searchResults: searchResults,
        searchQuery: productName,
      },
      metadata: recognitionResult.metadata,
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
 * @param {number} userId - User ID for search filtering
 * @returns {Promise<Object>} Analysis result with detected product and search suggestions
 */
export async function analyzeVoiceForCatalogueEntry(transcript, userId) {
  try {
    if (!aiService.isAiEnabled()) {
      return {
        success: false,
        error: 'LLM service is disabled',
      };
    }

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

    const searchResults = await searchCatalogueEntries(productData.generalizedName, userId);

    return {
      success: true,
      data: {
        detectedProduct: productData,
        searchResults: searchResults,
        confidence: productData.confidence,
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
 * @param {number} userId - User ID for visibility filtering
 * @returns {Promise<Array>} Array of matching catalogue entry IDs
 */
export async function searchCatalogueEntriesRealtime(query, userId) {
  try {
    if (!aiService.isAiEnabled()) {
      return [];
    }

    if (!query || query.trim() === '') {
      return [];
    }

    const trimmedQuery = query.trim().toLowerCase();
    let queryEmbedding = null;

    queryEmbedding = await dbFood.getQueryEmbedding(trimmedQuery);

    if (!queryEmbedding) {
      const embeddingResult = await aiService.generateEmbedding(trimmedQuery);
      if (!embeddingResult.success) {
        console.error('Failed to generate embedding for realtime search:', embeddingResult.error);
        return [];
      }

      queryEmbedding = embeddingResult.data.embedding;
      await dbFood.saveQueryEmbedding(trimmedQuery, queryEmbedding);
    }

    const searchResults = await dbFood.searchCatalogueEntriesByEmbedding(queryEmbedding, userId);

    return searchResults.map((result) => result.id);
  } catch (error) {
    console.error('Error in realtime semantic search:', error);
    return [];
  }
}
