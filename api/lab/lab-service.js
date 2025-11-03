import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import * as dbFood from '../../db/db-food.js';
import * as aiService from '../ai/ai-service.js';
import * as imageService from '../ai/image-service.js';

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

function getExistingImageIds() {
  try {
    const origDir = join(process.cwd(), 'public', 'images', 'food', 'orig');

    if (!existsSync(origDir)) {
      console.log('⚠️ Orig directory not found');
      return [];
    }

    const files = readdirSync(origDir);

    const imageIds = new Set();
    const originalFilePattern = /^(\d+)-original-v\d+\.(png|jpg|jpeg|webp)$/;

    for (const file of files) {
      const match = file.match(originalFilePattern);
      if (match) {
        imageIds.add(parseInt(match[1]));
      }
    }

    console.log(`📊 Found ${imageIds.size} products with existing images`);
    return Array.from(imageIds);
  } catch (error) {
    console.error('💥 Error reading orig directory:', error);
    return [];
  }
}

export async function generateImageFromId(catalogueId) {
  try {
    console.log(`🎨 Single image generation: catalogueId=${catalogueId}`);

    const entry = await dbFood.getCatalogueEntryById(catalogueId);
    if (!entry) {
      console.log(`❌ Catalogue entry ID ${catalogueId} not found`);
      return {
        success: false,
        error: `Catalogue entry with ID ${catalogueId} not found`,
      };
    }

    console.log(`📦 Processing: "${entry.name}" (ID: ${catalogueId})`);

    const existingIds = getExistingImageIds();
    if (existingIds.includes(catalogueId)) {
      console.log(`⚠️ Image already exists for product ${catalogueId}`);
      return {
        success: false,
        error: `Image already exists for product ${catalogueId}`,
      };
    }

    console.log('⌛ Generating image...');
    const result = await imageService.generateProductImage(catalogueId, entry.name, entry.description || '');

    if (!result.success) {
      console.log(`❌ Image generation failed: ${result.error}`);
      return {
        success: false,
        error: result.error,
      };
    }

    console.log(`✅ Success: image generated for "${entry.name}"`);
    return {
      success: true,
      data: {
        catalogueId,
        name: entry.name,
        imageData: result.data,
      },
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('💥 Single image generation error:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

export async function generateImageBatch(batchSize) {
  try {
    console.log(`🚀 Starting batch image generation: ${batchSize} products`);

    const existingImageIds = getExistingImageIds();
    const entries = await dbFood.getCatalogueEntriesWithoutImages(existingImageIds, batchSize);

    if (!entries || entries.length === 0) {
      console.log('⚠️ No products found without images');
      return {
        success: false,
        error: 'No catalogue entries without images found',
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
        const imageResult = await imageService.generateProductImage(entry.id, entry.name, entry.description || '');

        if (!imageResult.success) {
          console.log(`❌ [${i + 1}/${entries.length}] Image generation failed: ${imageResult.error}`);
          results.push({
            id: entry.id,
            name: entry.name,
            generated: false,
            error: imageResult.error,
          });
          failedCount++;
          continue;
        }

        console.log(`✅ [${i + 1}/${entries.length}] Success: image generated for "${entry.name}"`);
        results.push({
          id: entry.id,
          name: entry.name,
          generated: true,
          imageData: imageResult.data,
        });
        successCount++;
      } catch (error) {
        console.error(`💥 [${i + 1}/${entries.length}] Exception: ${error.message}`);
        results.push({
          id: entry.id,
          name: entry.name,
          generated: false,
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
    };
  } catch (error) {
    console.error('💥 Batch image generation fatal error:', error);
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

export async function regenerateImageVariantsFromId(catalogueId) {
  try {
    console.log(`🔄 Regenerating image variants for catalogueId=${catalogueId}`);

    const entry = await dbFood.getCatalogueEntryById(catalogueId);
    if (!entry) {
      console.log(`❌ Catalogue entry ID ${catalogueId} not found in database`);
      return {
        success: false,
        error: `Catalogue entry with ID ${catalogueId} not found`,
      };
    }

    console.log(`📦 Processing: "${entry.name}" (ID: ${catalogueId})`);

    const result = await imageService.regenerateImageVariantsFromOriginal(catalogueId);

    if (!result.success) {
      console.log(`❌ Regeneration failed: ${result.error}`);
      return {
        success: false,
        error: result.error,
      };
    }

    console.log(`✅ Success: all variants regenerated for "${entry.name}"`);
    return {
      success: true,
      data: {
        catalogueId,
        name: entry.name,
        variants: result.data,
      },
    };
  } catch (error) {
    console.error('💥 Image variants regeneration error:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

export async function regenerateImageVariantsBatch(batchSize) {
  try {
    console.log(`🚀 Starting batch image variants regeneration: up to ${batchSize} products`);

    const imagesDir = join(process.cwd(), 'public', 'images', 'food');
    const origDir = join(imagesDir, 'orig');

    if (!existsSync(origDir)) {
      console.log(`❌ Original images directory not found`);
      return {
        success: false,
        error: 'Original images directory not found',
        data: [],
        batchInfo: {
          totalRequested: batchSize,
          totalProcessed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      };
    }

    const allEntries = await dbFood.getAllCatalogueEntries();
    if (!allEntries || allEntries.length === 0) {
      console.log('⚠️ No catalogue entries found');
      return {
        success: false,
        error: 'No catalogue entries found',
        data: [],
        batchInfo: {
          totalRequested: batchSize,
          totalProcessed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      };
    }

    console.log(`📦 Found ${allEntries.length} catalogue entries`);

    const origFiles = readdirSync(origDir);
    const catalogueIdsWithOriginals = new Set();

    for (const file of origFiles) {
      const match = file.match(/^(\d+)-original-v\d+\./);
      if (match) {
        catalogueIdsWithOriginals.add(parseInt(match[1]));
      }
    }

    console.log(`📂 Found ${catalogueIdsWithOriginals.size} products with original images`);

    const variantFiles = readdirSync(imagesDir);

    const entriesToProcess = [];

    for (const entry of allEntries) {
      const catalogueId = entry.id;

      if (!catalogueIdsWithOriginals.has(catalogueId)) {
        continue;
      }

      const hasThumb = variantFiles.some((f) => f.match(new RegExp(`^${catalogueId}-thumb-v\\d+\\.webp$`)));
      const hasMedium = variantFiles.some((f) => f.match(new RegExp(`^${catalogueId}-medium-v\\d+\\.webp$`)));
      const hasLarge = variantFiles.some((f) => f.match(new RegExp(`^${catalogueId}-large-v\\d+\\.webp$`)));
      const hasSquircle = variantFiles.some((f) => f.match(new RegExp(`^${catalogueId}-squircle-v\\d+\\.png$`)));
      const hasCorner = variantFiles.some((f) => f.match(new RegExp(`^${catalogueId}-corner-v\\d+\\.png$`)));

      if (!hasThumb || !hasMedium || !hasLarge || !hasSquircle || !hasCorner) {
        entriesToProcess.push(entry);
      }
    }

    if (entriesToProcess.length === 0) {
      console.log('✅ All products already have complete image variants');
      return {
        success: true,
        data: [],
        batchInfo: {
          totalRequested: batchSize,
          totalProcessed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: allEntries.length,
        },
      };
    }

    console.log(`🔄 Found ${entriesToProcess.length} products needing variant regeneration`);

    // Limit to requested batch size
    const entriesToProcessLimited = entriesToProcess.slice(0, batchSize);
    console.log(`📊 Processing ${entriesToProcessLimited.length} products (requested: ${batchSize})`);

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < entriesToProcessLimited.length; i++) {
      const entry = entriesToProcessLimited[i];

      try {
        const regenerateResult = await imageService.regenerateImageVariantsFromOriginal(entry.id);

        if (!regenerateResult.success) {
          results.push({
            id: entry.id,
            name: entry.name,
            regenerated: false,
            error: regenerateResult.error,
          });
          failedCount++;
        } else {
          results.push({
            id: entry.id,
            name: entry.name,
            regenerated: true,
            variants: regenerateResult.data,
          });
          successCount++;
        }
      } catch (error) {
        results.push({
          id: entry.id,
          name: entry.name,
          regenerated: false,
          error: 'Internal processing error',
        });
        failedCount++;
      }

      // Компактный прогресс в одну строку
      console.log(
        `🔄 [${i + 1}/${entriesToProcessLimited.length}] ✅ ${successCount} | ❌ ${failedCount} | Left: ${
          entriesToProcessLimited.length - i - 1
        } | ${entry.name.slice(0, 35)}`
      );
    }

    console.log(
      `🏁 Batch complete: ✅ ${successCount} success | ❌ ${failedCount} failed | 📊 ${entriesToProcessLimited.length} total`
    );

    return {
      success: true,
      data: results,
      batchInfo: {
        totalRequested: batchSize,
        totalProcessed: entriesToProcessLimited.length,
        successCount,
        failedCount,
        skippedCount: allEntries.length - entriesToProcess.length,
      },
    };
  } catch (error) {
    console.error('💥 Batch image variants regeneration fatal error:', error);
    return {
      success: false,
      error: 'Internal server error',
      data: [],
      batchInfo: {
        totalRequested: batchSize,
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    };
  }
}
