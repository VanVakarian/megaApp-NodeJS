import * as dbFood from '../../db/db-food.js';
import * as aiService from '../ai/ai-service.js';

function isNutritionDataValid(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const requiredFields = ['generalizedName', 'kcals', 'protein', 'fat', 'carbs', 'fiber', 'description'];

  for (const field of requiredFields) {
    if (!(field in data)) {
      return false;
    }
  }

  if (!data.generalizedName || typeof data.generalizedName !== 'string' || data.generalizedName.trim().length === 0) {
    return false;
  }

  const numericFields = ['kcals', 'protein', 'fat', 'carbs', 'fiber'];
  for (const field of numericFields) {
    if (typeof data[field] !== 'number' || isNaN(data[field]) || data[field] < 0) {
      return false;
    }
  }

  if (data.kcals > 1000 || data.protein > 100 || data.fat > 100 || data.carbs > 100 || data.fiber > 50) {
    return false;
  }

  if (!data.description || typeof data.description !== 'string') {
    return false;
  }

  return true;
}

export async function generateProductFromInput(description, catalogueId, useKcals = false, saveToDb = false) {
  try {
    console.log(`🎯 Single product generation: catalogueId=${catalogueId} | save=${saveToDb} | useKcals=${useKcals}`);

    let foodDescriptionForGeneration;
    let originalCatalogueEntry = null;
    let generatedFrom = null;

    if (description && description.trim()) {
      foodDescriptionForGeneration = description.trim();
      generatedFrom = 'description';
      console.log(`📝 Input: "${foodDescriptionForGeneration}"`);
    } else if (catalogueId) {
      originalCatalogueEntry = await dbFood.getCatalogueEntryById(catalogueId);
      if (!originalCatalogueEntry) {
        console.log(`❌ Catalogue entry ID ${catalogueId} not found`);
        return {
          success: false,
          error: `Catalogue entry with ID ${catalogueId} not found`,
        };
      }

      foodDescriptionForGeneration = originalCatalogueEntry.name;
      if (useKcals) {
        foodDescriptionForGeneration += ` ${originalCatalogueEntry.kcals} ккал`;
      }
      if (originalCatalogueEntry.description) {
        foodDescriptionForGeneration += ` ${originalCatalogueEntry.description}`;
      }
      generatedFrom = `catalogueId:${catalogueId}`;
      console.log(`📦 Processing: "${originalCatalogueEntry.name}" (ID: ${catalogueId})`);
    } else {
      console.log('❌ No description or catalogueId provided');
      return {
        success: false,
        error: 'Either description or catalogueId must be provided',
      };
    }

    console.log('⌛ Generating with LLM...');
    const llmResult = await aiService.generateGeneralizedProduct(foodDescriptionForGeneration);

    if (!llmResult.success) {
      console.log(`❌ Generation failed: ${llmResult.error}`);
      return {
        success: false,
        error: llmResult.error,
      };
    }

    const nutritionData = {
      generalizedName: llmResult.data.generalizedName,
      kcals: llmResult.data.kcals,
      protein: llmResult.data.protein,
      fat: llmResult.data.fat,
      carbs: llmResult.data.carbs,
      fiber: llmResult.data.fiber,
      description: llmResult.data.description,
    };

    if (!isNutritionDataValid(nutritionData)) {
      console.log('❌ Validation failed');
      return {
        success: false,
        error: 'Generated data failed validation',
        data: nutritionData,
      };
    }

    if (saveToDb && originalCatalogueEntry && catalogueId) {
      console.log('💾 Saving to database...');
      const updateResult = await dbFood.updateCatalogueEntryFull(
        catalogueId,
        nutritionData.generalizedName,
        nutritionData.kcals,
        nutritionData.protein,
        nutritionData.fat,
        nutritionData.carbs,
        nutritionData.fiber,
        nutritionData.description
      );

      if (updateResult !== true) {
        console.log(`❌ DB save failed: ${updateResult?.error || 'unknown error'}`);
        return {
          success: false,
          error: updateResult?.error || 'Failed to save to database',
          data: nutritionData,
        };
      }

      console.log(`✅ Success: "${nutritionData.generalizedName}" saved to DB`);
      return {
        success: true,
        data: {
          name: nutritionData.generalizedName,
          kcals: nutritionData.kcals,
          protein: nutritionData.protein,
          fat: nutritionData.fat,
          carbs: nutritionData.carbs,
          fiber: nutritionData.fiber,
          description: nutritionData.description,
        },
        metadata: llmResult.metadata,
        saved: true,
        generatedFrom: generatedFrom,
        previousData: {
          id: originalCatalogueEntry.id,
          name: originalCatalogueEntry.name,
          legacyName: originalCatalogueEntry.legacyName,
          kcals: originalCatalogueEntry.kcals,
        },
      };
    }

    console.log(`✅ Success: "${nutritionData.generalizedName}" (preview mode)`);
    return {
      success: true,
      data: {
        name: nutritionData.generalizedName,
        kcals: nutritionData.kcals,
        protein: nutritionData.protein,
        fat: nutritionData.fat,
        carbs: nutritionData.carbs,
        fiber: nutritionData.fiber,
        description: nutritionData.description,
      },
      metadata: llmResult.metadata,
      saved: false,
      generatedFrom: generatedFrom,
    };
  } catch (error) {
    console.error('💥 Single product generation error:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

export async function generateBatch(batchSize, useKcals = false, saveToDb = false) {
  try {
    console.log(`🚀 Starting batch generation: ${batchSize} products | save=${saveToDb} | useKcals=${useKcals}`);

    const entries = await dbFood.getCatalogueEntriesWithoutDescription(batchSize);

    if (!entries || entries.length === 0) {
      console.log('⚠️ No products found without description');
      return {
        success: false,
        error: 'No catalogue entries without description found',
        data: [],
        batchInfo: {
          totalRequested: batchSize,
          totalProcessed: 0,
          successCount: 0,
          failedCount: 0,
        },
      };
    }

    console.log(`📦 Found ${entries.length} products to process`);

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`⏳ [${i + 1}/${entries.length}] Processing: "${entry.name}" (ID: ${entry.id})`);

      try {
        let foodDescriptionForGeneration = entry.name;
        if (useKcals) {
          foodDescriptionForGeneration += ` ${entry.kcals} ккал`;
        }

        const llmResult = await aiService.generateGeneralizedProduct(foodDescriptionForGeneration);

        if (!llmResult.success) {
          console.log(`❌ [${i + 1}/${entries.length}] Generation failed: ${llmResult.error}`);
          results.push({
            id: entry.id,
            generated: null,
            saved: false,
            error: llmResult.error,
          });
          failedCount++;
          continue;
        }

        const nutritionData = {
          generalizedName: llmResult.data.generalizedName,
          kcals: llmResult.data.kcals,
          protein: llmResult.data.protein,
          fat: llmResult.data.fat,
          carbs: llmResult.data.carbs,
          fiber: llmResult.data.fiber,
          description: llmResult.data.description,
        };

        if (!isNutritionDataValid(nutritionData)) {
          console.log(`❌ [${i + 1}/${entries.length}] Validation failed`);
          results.push({
            id: entry.id,
            generated: null,
            saved: false,
            error: 'Generated data failed validation',
          });
          failedCount++;
          continue;
        }

        let isSaved = false;
        if (saveToDb) {
          const updateResult = await dbFood.updateCatalogueEntryFull(
            entry.id,
            nutritionData.generalizedName,
            nutritionData.kcals,
            nutritionData.protein,
            nutritionData.fat,
            nutritionData.carbs,
            nutritionData.fiber,
            nutritionData.description
          );

          if (updateResult !== true) {
            console.log(`❌ [${i + 1}/${entries.length}] DB save failed: ${updateResult?.error || 'unknown error'}`);
            results.push({
              id: entry.id,
              generated: {
                name: nutritionData.generalizedName,
                kcals: nutritionData.kcals,
                protein: nutritionData.protein,
                fat: nutritionData.fat,
                carbs: nutritionData.carbs,
                fiber: nutritionData.fiber,
                description: nutritionData.description,
              },
              saved: false,
              error: updateResult?.error || 'Failed to save to database',
            });
            failedCount++;
            continue;
          }

          isSaved = true;
        }

        console.log(
          `✅ [${i + 1}/${entries.length}] Success: "${nutritionData.generalizedName}" ${
            isSaved ? '(saved)' : '(preview)'
          }`
        );
        results.push({
          id: entry.id,
          generated: {
            name: nutritionData.generalizedName,
            kcals: nutritionData.kcals,
            protein: nutritionData.protein,
            fat: nutritionData.fat,
            carbs: nutritionData.carbs,
            fiber: nutritionData.fiber,
            description: nutritionData.description,
          },
          saved: isSaved,
        });
        successCount++;
      } catch (error) {
        console.error(`💥 [${i + 1}/${entries.length}] Exception: ${error.message}`);
        results.push({
          id: entry.id,
          generated: null,
          saved: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    console.log(
      `🏁 Batch complete: ✅ ${successCount} success | ❌ ${failedCount} failed | 📊 ${entries.length} total`
    );

    return {
      success: true,
      data: results,
      batchInfo: {
        totalRequested: batchSize,
        totalProcessed: entries.length,
        successCount,
        failedCount,
      },
      metadata: {
        useKcals,
        saveToDb,
      },
    };
  } catch (error) {
    console.error('💥 Batch generation fatal error:', error);
    return {
      success: false,
      error: 'Internal server error',
      data: [],
      batchInfo: {
        totalRequested: batchSize,
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
      },
    };
  }
}

export async function generateEmbeddings(count) {
  try {
    console.log(`🎯 Starting embeddings generation: ${count} entries`);

    const entries = await dbFood.getCatalogueEntriesWithoutEmbeddings(count);

    if (!entries || entries.length === 0) {
      console.log('⚠️ No entries found without embeddings');
      return {
        success: false,
        error: 'No catalogue entries without embeddings found',
        data: [],
        batchInfo: {
          totalRequested: count,
          totalProcessed: 0,
          successCount: 0,
          failedCount: 0,
        },
      };
    }

    console.log(`📦 Found ${entries.length} entries to process`);

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`⏳ [${i + 1}/${entries.length}] Processing: "${entry.name}" (ID: ${entry.id})`);

      try {
        let nameEmbedding = null;
        let descriptionEmbedding = null;
        let nameEmbeddingResult = null;
        let descriptionEmbeddingResult = null;

        const embeddingPromises = [];

        if (!entry.nameVec && entry.name) {
          console.log(`📝 Generating name embedding: "${entry.name}"`);
          embeddingPromises.push(
            aiService.generateEmbedding(entry.name).then((result) => {
              nameEmbeddingResult = result;
              return { type: 'name', result };
            })
          );
        }

        if (!entry.descriptionVec && entry.description && entry.description.trim().length > 0) {
          console.log(`📝 Generating description embedding: "${entry.description}"`);
          embeddingPromises.push(
            aiService.generateEmbedding(entry.description).then((result) => {
              descriptionEmbeddingResult = result;
              return { type: 'description', result };
            })
          );
        }

        if (embeddingPromises.length > 0) {
          const results = await Promise.all(embeddingPromises);

          for (const { type, result } of results) {
            if (result.success) {
              if (type === 'name') {
                nameEmbedding = result.data.embedding;
                console.log(`✅ Name embedding generated: ${result.data.dimensions} dimensions`);
              } else if (type === 'description') {
                descriptionEmbedding = result.data.embedding;
                console.log(`✅ Description embedding generated: ${result.data.dimensions} dimensions`);
              }
            } else {
              console.log(`❌ Failed to generate ${type} embedding: ${result.error}`);
            }
          }
        }

        if (!nameEmbedding && !descriptionEmbedding) {
          console.log(`❌ [${i + 1}/${entries.length}] No embeddings generated`);
          results.push({
            id: entry.id,
            name: entry.name,
            nameEmbedding: null,
            descriptionEmbedding: null,
            saved: false,
            error: 'Failed to generate any embeddings',
          });
          failedCount++;
          continue;
        }

        const updateResult = await dbFood.updateCatalogueEntryEmbedding(entry.id, nameEmbedding, descriptionEmbedding);

        if (!updateResult) {
          console.log(`❌ [${i + 1}/${entries.length}] DB save failed`);
          results.push({
            id: entry.id,
            name: entry.name,
            nameEmbedding: nameEmbedding ? { dimensions: nameEmbeddingResult.data.dimensions } : null,
            descriptionEmbedding: descriptionEmbedding
              ? { dimensions: descriptionEmbeddingResult.data.dimensions }
              : null,
            saved: false,
            error: 'Failed to save embeddings to database',
          });
          failedCount++;
          continue;
        }

        console.log(`✅ [${i + 1}/${entries.length}] Success: embeddings saved to DB`);
        results.push({
          id: entry.id,
          name: entry.name,
          nameEmbedding: nameEmbedding
            ? {
                dimensions: nameEmbeddingResult.data.dimensions,
                model: nameEmbeddingResult.metadata.model,
                provider: nameEmbeddingResult.metadata.provider,
              }
            : null,
          descriptionEmbedding: descriptionEmbedding
            ? {
                dimensions: descriptionEmbeddingResult.data.dimensions,
                model: descriptionEmbeddingResult.metadata.model,
                provider: descriptionEmbeddingResult.metadata.provider,
              }
            : null,
          saved: true,
        });
        successCount++;
      } catch (error) {
        console.error(`💥 [${i + 1}/${entries.length}] Exception: ${error.message}`);
        results.push({
          id: entry.id,
          name: entry.name,
          nameEmbedding: null,
          descriptionEmbedding: null,
          saved: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    console.log(
      `🏁 Embeddings generation complete: ✅ ${successCount} success | ❌ ${failedCount} failed | 📊 ${entries.length} total`
    );

    return {
      success: true,
      data: results,
      batchInfo: {
        totalRequested: count,
        totalProcessed: entries.length,
        successCount,
        failedCount,
      },
    };
  } catch (error) {
    console.error('💥 Embeddings generation fatal error:', error);
    return {
      success: false,
      error: 'Internal server error',
      data: [],
      batchInfo: {
        totalRequested: count,
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
      },
    };
  }
}
