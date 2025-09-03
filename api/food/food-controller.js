import fs from 'fs/promises';
import path from 'path';
import * as coefficientsService from '../../coefficients/coeffs-service.js';
import * as dbFood from '../../db/db-food.js';
import * as utils from '../../utils/utils.js';
import { updateUserDataLastModified } from '../ws/sync-state.js';
import * as foodService from './food-service.js';

export const WS_MESSAGE_TYPES = {
  SYNC_STATUS: 'SYNC_STATUS',
  DIARY_ENTRY_CREATED: 'DIARY_ENTRY_CREATED',
  DIARY_ENTRY_UPDATED: 'DIARY_ENTRY_UPDATED',
  DIARY_ENTRY_DELETED: 'DIARY_ENTRY_DELETED',
  BODY_WEIGHT_UPDATED: 'BODY_WEIGHT_UPDATED',
  START_VOICE_RECORDING: 'START_VOICE_RECORDING',
  STOP_VOICE_RECORDING: 'STOP_VOICE_RECORDING',
  AUDIO_CHUNK: 'AUDIO_CHUNK',
  VOICE_SEARCH_RESULTS: 'VOICE_SEARCH_RESULTS',
  SEARCH_QUERY: 'SEARCH_QUERY',
  SEARCH_RESULTS: 'SEARCH_RESULTS',
};

// ===================================================================================================== FULL UPDATE ===

export async function getFoodDiaryFullUpdateRange(request, reply) {
  const userId = request.user.id;

  // const userTZOffsetHours = 4; // TODO: implement in settings // don't need here anymore?
  // const userPreferredMidnightOffsetHours = 5; // TODO: implement in settings // don't need here anymore?
  const { date: dateIso, offset: offsetDaysStr } = request.query;
  const offsetDaysNum = parseInt(offsetDaysStr);

  const datesIsoList = foodService.getDateRange(dateIso, offsetDaysNum);
  const [startDate, endDate] = utils.getStartAndEndDates(dateIso, offsetDaysNum);

  let diaryResult = Object.fromEntries(datesIsoList.map((date) => [date, {}]));

  const foodDiaryRawData = await dbFood.getRangeOfUsersDiaryEntries(userId, startDate, endDate);
  const foodDiaryPrepped = foodService.organizeByDatesAndIds(foodDiaryRawData);
  diaryResult = foodService.extendDiary(diaryResult, 'food', foodDiaryPrepped, {});

  const bodyWeightRawData = await dbFood.getRangeOfUsersBodyWeightEntries(userId, startDate, endDate);
  const bodyWeightPrepped = foodService.organizeWeightsByDate(bodyWeightRawData);
  diaryResult = foodService.extendDiary(diaryResult, 'bodyWeight', bodyWeightPrepped, null);

  const stats = await foodService.getStats(userId);
  const targetKcals = {};
  let lastKnownTargetKcals = null;

  datesIsoList.forEach((date) => {
    if (stats[date]) {
      lastKnownTargetKcals = stats[date][3]; // [3] is targetKcals
      targetKcals[date] = lastKnownTargetKcals;
    } else {
      targetKcals[date] = lastKnownTargetKcals;
    }
  });

  diaryResult = foodService.extendDiary(diaryResult, 'targetKcals', targetKcals, null);

  return reply.code(200).send(JSON.stringify(diaryResult));
}

// =========================================================================================================== DIARY ===

export async function createDiaryEntry(request, reply) {
  const { dateISO, foodCatalogueId, foodWeight, history } = request.body;
  const userId = request.user.id;
  // const userTZOffsetHours = 4; // TODO: implement in settings // don't need here anymore?
  // const userPreferredMidnightOffsetHours = 5; // TODO: implement in settings // don't need here anymore?

  try {
    const historyStr = JSON.stringify(history);
    const resId = await dbFood.dbCreateDiaryEntry(dateISO, foodCatalogueId, foodWeight, historyStr, userId);

    if (resId) {
      updateUserDataLastModified(userId);
      request.server.scheduleStatsRecalculation(userId);
      const clientId = request.server.getClientId(request);
      request.server.broadcast(
        userId,
        {
          type: WS_MESSAGE_TYPES.DIARY_ENTRY_CREATED,
          payload: {
            id: resId,
            dateISO,
            foodCatalogueId,
            foodWeight,
            history,
          },
        },
        clientId
      );
      return reply.code(201).send({ result: true, diaryId: resId });
    }
    return reply.code(400).send({ result: false, error: 'Diary entry not created' });
  } catch (error) {
    console.error('Error in createDiaryEntry:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

export async function editDiaryEntry(request, reply) {
  const diaryEntry = request.body;
  const userId = request.user.id;
  const historyStr = await foodService.makeUpdatedHistoryString(diaryEntry.id, userId, diaryEntry.history[0]);
  const result = await dbFood.dbEditDiaryEntry(diaryEntry.foodWeight, historyStr, diaryEntry.id, userId);

  if (result) {
    updateUserDataLastModified(userId);
    request.server.scheduleStatsRecalculation(userId);
    const clientId = request.server.getClientId(request);
    request.server.broadcast(
      userId,
      {
        type: WS_MESSAGE_TYPES.DIARY_ENTRY_UPDATED,
        payload: {
          id: diaryEntry.id,
          newFoodWeight: diaryEntry.foodWeight,
          newHistoryEntry: diaryEntry.history[0],
        },
      },
      clientId
    );
    return reply.code(200).send({ result: result, diaryId: diaryEntry.id });
  }
  return reply.code(400).send({ result: false, error: 'Diary entry not found' });
}

export async function deleteDiaryEntry(request, reply) {
  const { diaryId } = request.params;
  const userId = request.user.id;

  try {
    const result = await dbFood.dbDeleteDiaryEntry(diaryId, userId);

    if (result) {
      updateUserDataLastModified(userId);
      request.server.scheduleStatsRecalculation(userId);
      const clientId = request.server.getClientId(request);
      request.server.broadcast(
        userId,
        {
          type: WS_MESSAGE_TYPES.DIARY_ENTRY_DELETED,
          payload: { deletedDiaryEntryId: parseInt(diaryId) },
        },
        clientId
      );
      return reply.code(200).send({ result: true });
    }
    return reply.code(404).send({ result: false, error: 'Entry not found' });
  } catch (error) {
    console.error('Error deleting diary entry:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

// ================================================================================================== MAIN CATALOGUE ===

export async function getCatalogue(request, reply) {
  const catalogue = await foodService.formFoodCatalogue();
  return reply.code(200).send(JSON.stringify(catalogue));
}

export async function createCatalogueEntry(request, reply) {
  const { foodName, foodKcals } = request.body;
  const userId = request.user.id;
  const newFoodId = await dbFood.addFoodCatalogueEntry(foodName, foodKcals);
  if (newFoodId) {
    const result = await foodService.addCatalogueEntryToUserVisibility(userId, newFoodId);
    if (result.success) {
      updateUserDataLastModified(userId);
      return reply.code(200).send({ result: true, id: newFoodId });
    }
  }
  return reply.code(400).send({ result: false, error: 'Catalogue entry not created' });
}

// ============================================================================================= NEW SEMANTIC SEARCH ===

/**
 * Handles semantic search requests for catalogue entries
 * @param {Object} request - Fastify request object with query parameters
 * @param {Object} reply - Fastify reply object
 * @returns {Promise<Object>} Search results with matching catalogue entries
 */
export async function searchCatalogueEntries(request, reply) {
  const { query } = request.query;

  if (!query || query.trim() === '') {
    return reply.code(400).send({ result: false, error: 'Query parameter is required' });
  }

  try {
    const searchResults = await foodService.searchCatalogueEntries(query.trim());
    return reply.code(200).send({
      result: true,
      data: searchResults,
    });
  } catch (error) {
    console.error('Error in search controller:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

/**
 * Creates generalized catalogue entry from user description using LLM analysis
 * @param {Object} request - Fastify request object with description in body
 * @param {Object} reply - Fastify reply object
 * @returns {Promise<Object>} Created catalogue entry data
 */
export async function createGeneralizedCatalogueEntry(request, reply) {
  const { description } = request.body;
  const userId = request.user.id;

  if (!description || description.trim() === '') {
    return reply.code(400).send({ result: false, error: 'Description is required' });
  }

  try {
    const result = await foodService.createGeneralizedCatalogueEntry(description.trim());

    if (result.success) {
      updateUserDataLastModified(userId);
      return reply.code(201).send({
        result: true,
        data: result.data,
      });
    }

    return reply.code(400).send({ result: false, error: result.error });
  } catch (error) {
    console.error('Error in createGeneralizedCatalogueEntry:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

// ============================================================================================= MULTIMODAL ANALYSIS ===

/**
 * Analyzes uploaded food image using AI vision to detect products
 * @param {Object} request - Fastify request object with multipart image file
 * @param {Object} reply - Fastify reply object
 * @returns {Promise<Object>} Detected food product data and search suggestions
 */
export async function analyzeImage(request, reply) {
  const userId = request.user.id;

  try {
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ result: false, error: 'No image file provided' });
    }

    const buffer = await data.toBuffer();
    const mimeType = data.mimetype;

    if (!mimeType.startsWith('image/')) {
      return reply.code(400).send({ result: false, error: 'File must be an image' });
    }

    // For debugging purposes: save uploaded image to backups folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = mimeType.split('/')[1] || 'jpg';
    const fileName = `image-${userId}-${timestamp}.${fileExtension}`;
    const backupsDir = path.resolve(process.cwd(), 'backups');
    const filePath = path.join(backupsDir, fileName);
    await fs.writeFile(filePath, buffer);
    console.log(`Image saved to: ${filePath}`);
    return;

    const result = await foodService.analyzeImageForCatalogueEntry(buffer, mimeType);

    if (result.success) {
      return reply.code(200).send({ result: true, data: result.data });
    }

    return reply.code(500).send({ result: false, error: result.error });
  } catch (error) {
    console.error('Error analyzing image:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

/**
 * Analyzes voice transcript using AI to detect mentioned food products
 * @param {Object} request - Fastify request object with transcript in body
 * @param {Object} reply - Fastify reply object
 * @returns {Promise<Object>} Detected food product data and search suggestions
 */
export async function analyzeVoice(request, reply) {
  const { transcript } = request.body;

  if (!transcript || transcript.trim() === '') {
    return reply.code(400).send({ result: false, error: 'Transcript is required' });
  }

  try {
    const result = await foodService.analyzeVoiceForCatalogueEntry(transcript.trim());

    if (result.success) {
      return reply.code(200).send({ result: true, data: result.data });
    }

    return reply.code(500).send({ result: false, error: result.error });
  } catch (error) {
    console.error('Error analyzing voice:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

export async function editCatalogueEntry(request, reply) {
  const { foodId, foodName, foodKcals } = request.body;
  const result = await dbFood.updateFoodCatalogueEntry(foodId, foodName, foodKcals);
  if (result) {
    return reply.code(200).send({ result: true, id: foodId, name: foodName, kcals: foodKcals });
  }
  return reply.code(400).send({ result: false, error: 'Catalogue entry not found' });
}

// ==================================================================================================== COEFFICIENTS ===

export async function getCoefficients(request, reply) {
  const userId = request.user.id;
  try {
    const coefficients = await foodService.getCoefficients(userId);
    return reply.code(200).send({ result: true, data: coefficients });
  } catch (error) {
    console.error('Error getting coefficients:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

export async function calculateCoefficients(request, reply) {
  const userId = request.user.id;
  try {
    const result = await coefficientsService.calculateAndSaveCoefficients(userId);
    if (result) {
      updateUserDataLastModified(userId);
      return reply.code(200).send({ result: true, message: 'Coefficients calculated and saved.' });
    }
    return reply.code(500).send({ result: false, message: 'Coefficients calculation failed.' });
  } catch (error) {
    console.error('Error calculating coefficients:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

// ===================================================================================================== BODY WEIGHT ===

export async function processWeight(request, reply) {
  const { dateISO, bodyWeight } = request.body;
  const userId = request.user.id;
  const weight = parseFloat(bodyWeight);

  if (isNaN(weight)) {
    return reply.code(400).send({ result: false, error: 'Invalid weight value' });
  }

  try {
    const existingWeight = await dbFood.getWeightByDate(dateISO, userId);
    const result = existingWeight
      ? await dbFood.dbUpdateWeight(dateISO, weight, userId)
      : await dbFood.dbCreateWeight(dateISO, weight, userId);

    if (result) {
      updateUserDataLastModified(userId);
      request.server.scheduleStatsRecalculation(userId);
      const clientId = request.server.getClientId(request);
      request.server.broadcast(
        userId,
        {
          type: WS_MESSAGE_TYPES.BODY_WEIGHT_UPDATED,
          payload: { dateISO, newBodyWeight: weight },
        },
        clientId
      );
      return reply.code(201).send({ result: true });
    } else {
      return reply.code(400).send({ result: false, error: 'Weight not saved' });
    }
  } catch (error) {
    console.error('Error saving weight:', error);
    return reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

// =========================================================================================================== STATS ===

export async function getStats(request, reply) {
  const userId = request.user.id;

  try {
    const stats = await foodService.getStats(userId);
    return reply.code(200).send(stats);
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Failed to get stats' });
  }
}

// ======================================================================================================= WS SEARCH ===

/**
 * Handles real-time search queries via WebSocket for unified catalogue
 * @param {Object} socket - WebSocket connection
 * @param {Object} message - Incoming message with query
 */
export async function handleSearchQuery(socket, message) {
  try {
    const payload = message.payload;
    if (!payload) {
      return;
    }

    const { query } = payload;
    if (!query || typeof query !== 'string') {
      return;
    }

    const catalogueIds = await foodService.searchCatalogueEntriesRealtime(query.trim());

    socket.send(
      JSON.stringify({
        type: WS_MESSAGE_TYPES.SEARCH_RESULTS,
        payload: {
          query: query.trim(),
          catalogueIds: catalogueIds,
          timestamp: Date.now(),
        },
      })
    );
  } catch (error) {
    console.error('Error handling search query:', error);
  }
}
