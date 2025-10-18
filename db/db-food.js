import { FOOD_SEARCH_RESULTS_LIMIT } from '../env.js';
import { getConnection } from './db.js';

// =========================================================================================================== DIARY ===

export async function dbCreateDiaryEntry(dateISO, foodCatalogueId, foodWeight, history, userId) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodDiary (dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
      VALUES
        (?, ?, ?, ?, ?, ?, ?);
    `;
    const result = await connection.run(query, [dateISO, foodCatalogueId, foodWeight, history, userId, 0, 0]);
    return result.lastID;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function dbGetDiaryEntriesHistory(diaryId, userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        history
      FROM
        foodDiary
      WHERE
        id = ?
        AND usersId = ?;
    `;
    const result = await connection.all(query, [diaryId, userId]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getRangeOfUsersDiaryEntries(userId, startDate, endDate) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, dateISO, foodCatalogueId, foodWeight, history
      FROM
        foodDiary
      WHERE
        usersId = ?
        AND dateISO BETWEEN ? AND ?
      ORDER BY
        dateISO ASC;
      `;
    const result = await connection.all(query, [userId, startDate, endDate]);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function dbEditDiaryEntry(foodWeight, history, diaryId, userId) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodDiary
      SET
        foodWeight = ?, history = ?
      WHERE
        id = ?
        AND usersId = ?;
    `;
    const values = [foodWeight, history, diaryId, userId];
    await connection.run(query, values);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function dbDeleteDiaryEntry(diaryId, userId) {
  const connection = await getConnection();
  try {
    const query = `
      DELETE FROM
        foodDiary
      WHERE
        id = ?
        AND usersId = ?;
    `;
    const result = await connection.run(query, [diaryId, userId]);
    return result.changes > 0;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function getDiaryEntriesForDay(startOfDay, endOfDay) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, date
      FROM
        foodDiary
      WHERE
        date BETWEEN ? AND ?
      ORDER BY
        date ASC;
    `;
    const result = await connection.all(query, [startOfDay, endOfDay]);
    return result;
  } catch (error) {
    console.error('Error in getDiaryEntriesForDay:', error);
    return [];
  }
}

export async function getDiaryEntriesHistory(userId, startDate, endDate) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        d.dateISO,
        d.foodWeight,
        d.foodCatalogueId,
        c.kcals
      FROM
        foodDiary d JOIN foodCatalogue c ON d.foodCatalogueId = c.id
      WHERE
        d.usersId = ?
        AND d.dateISO BETWEEN ? AND ?
      ORDER BY
        d.dateISO ASC;
    `;
    const result = await connection.all(query, [userId, startDate, endDate]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getUserFirstDate(userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        MIN(date) as firstDate
      FROM (
        SELECT dateISO as date FROM foodDiary WHERE usersId = ?
          UNION
        SELECT dateISO as date FROM foodBodyWeight WHERE usersId = ?
      );
    `;
    const result = await connection.get(query, [userId, userId]);
    return result.firstDate;
  } catch (error) {
    console.error(error);
    return null;
  }
}

// ================================================================================================== MAIN CATALOGUE ===

export async function addFoodCatalogueEntry(foodName, foodKcals) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodCatalogue (name, kcals, legacyName)
      VALUES
        (?, ?, ?);
    `;
    const result = await connection.run(query, [foodName, foodKcals, foodName]);
    return result.lastID;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function createCatalogueEntryWithFullNutrition(foodName, nutritionData) {
  const connection = await getConnection();
  try {
    const { kcals, protein, fat, carbs, fiber, descriptionForEmbedding } = nutritionData;

    const query = `
      INSERT INTO
        foodCatalogue (name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding, legacyName)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        kcals = excluded.kcals,
        protein = excluded.protein,
        fat = excluded.fat,
        carbs = excluded.carbs,
        fiber = excluded.fiber,
        descriptionForEmbedding = excluded.descriptionForEmbedding,
        legacyName = excluded.legacyName;
    `;

    const result = await connection.run(query, [
      foodName,
      kcals,
      protein,
      fat,
      carbs,
      fiber,
      descriptionForEmbedding,
      foodName,
    ]);

    if (result.lastID) {
      return result.lastID;
    } else {
      const findQuery = `
        SELECT
          id
        FROM
          foodCatalogue
        WHERE
          name = ?;
      `;
      const existingEntry = await connection.get(findQuery, [foodName]);
      return existingEntry?.id || null;
    }
  } catch (error) {
    console.error('Error creating catalogue entry with full nutrition:', error);
    return null;
  }
}

export async function getCatalogueEntryByName(foodName) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding
      FROM
        foodCatalogue
      WHERE
        name = ?;
    `;
    const result = await connection.get(query, [foodName]);
    return result || null;
  } catch (error) {
    console.error('Error getting catalogue entry by name:', error);
    return null;
  }
}

export async function getCatalogueEntryById(catalogueId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding, legacyName, embedding
      FROM
        foodCatalogue
      WHERE
        id = ?;
    `;
    const result = await connection.get(query, [catalogueId]);
    return result || null;
  } catch (error) {
    console.error('Error getting catalogue entry by ID:', error);
    return null;
  }
}

export async function getCatalogueEntryByIdForAPI(catalogueId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding as description, legacyName
      FROM
        foodCatalogue
      WHERE
        id = ?;
    `;
    const result = await connection.get(query, [catalogueId]);
    return result || null;
  } catch (error) {
    console.error('Error getting catalogue entry by ID:', error);
    return null;
  }
}

export async function getCatalogueEntryByNameForAPI(foodName) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding as description
      FROM
        foodCatalogue
      WHERE
        name = ?;
    `;
    const result = await connection.get(query, [foodName]);
    return result || null;
  } catch (error) {
    console.error('Error getting catalogue entry by name:', error);
    return null;
  }
}

export async function updateFoodCatalogueEntry(foodId, foodName, foodKcals) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodCatalogue
      SET
        name = ?, kcals = ?, legacyName = ?
      WHERE
        id = ?;
    `;
    await connection.run(query, [foodName, foodKcals, foodName, foodId]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function updateFoodCatalogueNutrition(foodId, kcals, protein, fat, carbs, fiber, description) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodCatalogue
      SET
        kcals = ?, protein = ?, fat = ?, carbs = ?, fiber = ?, descriptionForEmbedding = ?
      WHERE
        id = ?;
    `;
    await connection.run(query, [kcals, protein, fat, carbs, fiber, description, foodId]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function updateCatalogueEntryFull(foodId, name, kcals, protein, fat, carbs, fiber, description) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodCatalogue
      SET
        name = ?, kcals = ?, protein = ?, fat = ?, carbs = ?, fiber = ?, descriptionForEmbedding = ?, legacyName = ?
      WHERE
        id = ?;
    `;
    await connection.run(query, [name, kcals, protein, fat, carbs, fiber, description, name, foodId]);
    return true;
  } catch (error) {
    console.error('Error updating catalogue entry:', error);
    if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed: foodCatalogue.name')) {
      return { success: false, error: 'DUPLICATE_NAME' };
    }
    return false;
  }
}

export async function updateCatalogueEntryNameAndDescription(foodId, name, description) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodCatalogue
      SET
        name = ?, descriptionForEmbedding = ?, legacyName = ?, embedding = 'enriched'
      WHERE
        id = ?;
    `;
    await connection.run(query, [name, description, name, foodId]);
    return { success: true };
  } catch (error) {
    console.error(error);

    if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed: foodCatalogue.name')) {
      return { success: false, error: 'DUPLICATE_NAME', sqliteError: error.message };
    }

    return { success: false, error: 'DATABASE_ERROR', sqliteError: error.message };
  }
}

export async function markCatalogueEntryAsConflicted(foodId, reason) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodCatalogue
      SET
        embedding = ?
      WHERE
        id = ?;
    `;
    await connection.run(query, [`conflicted:${reason}`, foodId]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function deleteFoodCatalogueEntry(id) {
  const connection = await getConnection();
  try {
    const query = `
      DELETE FROM
        foodCatalogue
      WHERE
        id = ?;
    `;
    await connection.run(query, [id]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function getAllFoodCatalogueEntries() {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding, legacyName, embedding
      FROM
        foodCatalogue
      ORDER BY
        name ASC;
    `;
    const result = await connection.all(query);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getAllFoodCatalogueEntriesForAPI() {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, name, kcals, protein, fat, carbs, fiber, descriptionForEmbedding as description, legacyName
      FROM
        foodCatalogue
      ORDER BY
        name ASC;
    `;
    const result = await connection.all(query);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function clearAllFoodCatalogueEntries() {
  const connection = await getConnection();
  try {
    const query = `DELETE FROM foodCatalogue;`;
    const result = await connection.run(query);
    return result.changes;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function importFoodCatalogueEntries(entries) {
  const connection = await getConnection();
  try {
    const insertQuery = `
      INSERT INTO foodCatalogue
        (name, descriptionForEmbedding, legacyName)
      VALUES
        (?, ?, ?);
    `;

    let insertedCount = 0;
    for (const entry of entries) {
      try {
        await connection.run(insertQuery, [entry.name, entry.descriptionForEmbedding || null, entry.name]);
        insertedCount++;
      } catch (entryError) {
        console.error(`Failed to insert entry "${entry.name}":`, entryError);
      }
    }

    return insertedCount;
  } catch (error) {
    console.error('Error importing catalogue entries:', error);
    return null;
  }
}

// ===================================================================================================== BODY WEIGHT ===

export async function getWeightByDate(dateISO, userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, weight
      FROM
        foodBodyWeight
      WHERE
        dateISO = ?
        AND usersId = ?;
    `;
    const result = await connection.get(query, [dateISO, userId]);
    return result;
  } catch (error) {
    console.error('Error getting weight:', error);
    throw error;
  }
}

export async function getRangeOfUsersBodyWeightEntries(userId, startDate, endDate) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, dateISO, weight
      FROM
        foodBodyWeight
      WHERE
        usersId = ?
        AND dateISO BETWEEN ? AND ?
      ORDER BY
        dateISO ASC;
    `;
    const result = await connection.all(query, [userId, startDate, endDate]);
    return result;
  } catch (error) {
    console.error(error);
  }
}

export async function dbCreateWeight(dateISO, weight, userId) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodBodyWeight (dateISO, weight, usersId)
      VALUES
        (?, ?, ?);
    `;
    const result = await connection.run(query, [dateISO, weight, userId]);
    return result.lastID;
  } catch (error) {
    console.error('Error creating weight:', error);
    throw error;
  }
}

export async function dbUpdateWeight(dateISO, weight, userId) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodBodyWeight
      SET
        weight = ?
      WHERE
        dateISO = ?
        AND usersId = ?;
    `;
    const result = await connection.run(query, [weight, dateISO, userId]);
    return result.changes > 0;
  } catch (error) {
    console.error('Error updating weight:', error);
    throw error;
  }
}

export async function getWeightHistory(userId, startDate, endDate) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        dateISO,
        weight
      FROM
        foodBodyWeight
      WHERE
        usersId = ?
        AND dateISO BETWEEN ? AND ?
      ORDER BY
        dateISO ASC;
    `;
    const result = await connection.all(query, [userId, startDate, endDate]);
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// =================================================================================================== FOOD SETTINGS ===

export async function getUsersCoefficients(userId) {
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        coefficients
      FROM
        foodSettings
      WHERE
        usersId = ?;
    `;
    const result = await connection.get(query, [userId]);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function setUsersCoefficients(userId, coefficients) {
  const connection = await getConnection();
  try {
    const checkQuery = `
      SELECT
        COUNT(*) as count
      FROM
        foodSettings
      WHERE
        usersId = ?;
    `;
    const checkResult = await connection.get(checkQuery, [userId]);

    if (checkResult.count > 0) {
      await updateUserCoefficients(userId, coefficients);
    } else {
      await createUserCoefficients(userId, coefficients);
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to save coefficients');
  }
}

async function updateUserCoefficients(userId, coefficients) {
  const connection = await getConnection();
  try {
    const query = `
      UPDATE
        foodSettings
      SET
        coefficients = ?
      WHERE
        usersId = ?;
    `;
    await connection.run(query, [coefficients, userId]);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to update coefficients');
  }
}

async function createUserCoefficients(userId, coefficients) {
  const connection = await getConnection();
  try {
    const query = `
      INSERT INTO
        foodSettings (usersId, coefficients)
      VALUES
        (?, ?);
    `;
    await connection.run(query, [userId, coefficients]);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to create coefficients');
  }
}

// ======================================================================================== JAVASCRIPT VECTOR SEARCH ===

/**
 * Calculates cosine distance between two vectors for similarity comparison
 * @param {Array|Float32Array} vecA - First vector
 * @param {Array|Float32Array} vecB - Second vector
 * @returns {number} Cosine distance (0 = identical, 1 = completely different)
 */
function cosineDistance(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 1;
  }

  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }

  const normProduct = Math.sqrt(normA) * Math.sqrt(normB);
  if (normProduct === 0) return 1;

  return 1 - dot / normProduct;
}

/**
 * Performs vector similarity search across all catalogue entries using JavaScript
 * @param {Array|Float32Array} embeddingArray - Query vector for similarity search
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array>} Sorted array of catalogue entries with distance scores
 */
export async function searchCatalogueEntriesByEmbedding(embeddingArray) {
  const connection = await getConnection();
  try {
    const queryVector = new Float32Array(embeddingArray);

    const query = `
      SELECT
        fc.id, fc.name, fc.kcals, fc.protein, fc.fat, fc.carbs, fc.fiber, fc.embedding
      FROM
        foodCatalogue fc
      WHERE
        fc.embedding IS NOT NULL
      ORDER BY
        fc.name ASC;
    `;

    const rows = await connection.all(query);

    const results = rows
      .map((row) => {
        const embedding = row.embedding ? new Float32Array(row.embedding.buffer) : null;
        const distance = embedding ? cosineDistance(queryVector, embedding) : 1;
        return {
          id: row.id,
          name: row.name,
          kcals: row.kcals,
          protein: row.protein,
          fat: row.fat,
          carbs: row.carbs,
          fiber: row.fiber,
          distance: distance,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, FOOD_SEARCH_RESULTS_LIMIT);

    return results;
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Updates catalogue entry with new vector embedding for semantic search
 * @param {number} catalogueId - Catalogue entry ID to update
 * @param {Array|Float32Array} embeddingArray - Vector embedding data
 * @returns {Promise<boolean>} Success status of the update operation
 */
export async function updateCatalogueEntryEmbedding(catalogueId, embeddingArray) {
  const connection = await getConnection();
  try {
    const buffer = Buffer.from(new Float32Array(embeddingArray).buffer);

    const updateQuery = `
      UPDATE
        foodCatalogue
      SET
        embedding = ?
      WHERE
        id = ?;
    `;
    const result = await connection.run(updateQuery, [buffer, catalogueId]);
    return result.changes > 0;
  } catch (error) {
    console.error('Error updating embedding:', error);
    return false;
  }
}

// ==================================================================================== SEARCH QUERY EMBEDDING CACHE ===

/**
 * Retrieves cached embedding for search query and updates usage statistics
 * @param {string} query - Search query text
 * @returns {Promise<Float32Array|null>} Cached embedding vector or null if not found
 */
export async function getQueryEmbedding(query) {
  const connection = await getConnection();
  try {
    const selectQuery = `
      SELECT
        embedding
      FROM
        foodSearchQueryEmbeddings
      WHERE
        query = ?;
    `;
    const result = await connection.get(selectQuery, [query]);

    if (result && result.embedding) {
      await updateQueryUsage(query);
      return new Float32Array(result.embedding.buffer);
    }

    return null;
  } catch (error) {
    console.error('Error getting query embedding:', error);
    return null;
  }
}

/**
 * Saves new search query embedding to cache
 * @param {string} query - Search query text
 * @param {Array|Float32Array} embeddingArray - Vector embedding data
 * @returns {Promise<boolean>} Success status of the save operation
 */
export async function saveQueryEmbedding(query, embeddingArray) {
  const connection = await getConnection();
  try {
    const buffer = Buffer.from(new Float32Array(embeddingArray).buffer);
    const timestamp = Date.now();

    const insertQuery = `
      INSERT OR REPLACE INTO
        foodSearchQueryEmbeddings (query, embedding, hitCount, lastUsedAt, createdAt)
      VALUES
        (?, ?, 1, ?, ?);
    `;
    const result = await connection.run(insertQuery, [query, buffer, timestamp, timestamp]);
    return result.changes > 0;
  } catch (error) {
    console.error('Error saving query embedding:', error);
    return false;
  }
}

/**
 * Updates usage statistics for cached search query
 * @param {string} query - Search query text
 * @returns {Promise<boolean>} Success status of the update operation
 */
export async function updateQueryUsage(query) {
  const connection = await getConnection();
  try {
    const timestamp = Date.now();

    const updateQuery = `
      UPDATE
        foodSearchQueryEmbeddings
      SET
        hitCount = hitCount + 1,
        lastUsedAt = ?
      WHERE
        query = ?;
    `;
    const result = await connection.run(updateQuery, [timestamp, query]);
    return result.changes > 0;
  } catch (error) {
    console.error('Error updating query usage:', error);
    return false;
  }
}
