import * as aiService from '../ai/ai-service.js';

export async function generateProductFromDescription(description) {
  try {
    const result = await aiService.generateGeneralizedProduct(description);

    if (!result.success) {
      throw new Error(`LLM service error: ${result.error}`);
    }

    if (!result.data || result.data.confidence < 0.6) {
      return {
        success: false,
        error: 'Low confidence in product identification',
        data: result.data,
      };
    }

    return {
      success: true,
      data: {
        generalizedName: result.data.generalizedName,
        kcals: Math.round(result.data.kcals),
        protein: Math.round(result.data.protein * 10) / 10,
        fat: Math.round(result.data.fat * 10) / 10,
        carbs: Math.round(result.data.carbs * 10) / 10,
        fiber: Math.round(result.data.fiber * 10) / 10,
        descriptionForEmbedding: result.data.descriptionForEmbedding,
        confidence: result.data.confidence,
      },
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('generateProductFromDescription error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function analyzeProductImage(imageBuffer, mimeType) {
  try {
    const result = await aiService.analyzeImage(imageBuffer, mimeType);

    if (!result.success) {
      throw new Error(`LLM service error: ${result.error}`);
    }

    if (!result.data) {
      return {
        success: true,
        data: null,
        reason: result.reason || 'No food product detected',
      };
    }

    if (result.data.confidence < 0.5) {
      return {
        success: true,
        data: null,
        reason: 'Low confidence in image analysis',
      };
    }

    return {
      success: true,
      data: {
        generalizedName: result.data.generalizedName,
        kcals: Math.round(result.data.kcals),
        protein: Math.round(result.data.protein * 10) / 10,
        fat: Math.round(result.data.fat * 10) / 10,
        carbs: Math.round(result.data.carbs * 10) / 10,
        fiber: Math.round(result.data.fiber * 10) / 10,
        descriptionForEmbedding: result.data.descriptionForEmbedding,
        confidence: result.data.confidence,
      },
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('analyzeProductImage error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function analyzeVoiceForProduct(transcript) {
  try {
    const result = await aiService.analyzeVoiceTranscript(transcript);

    if (!result.success) {
      throw new Error(`LLM service error: ${result.error}`);
    }

    if (!result.data) {
      return {
        success: true,
        data: null,
        reason: result.reason || 'No food product detected in transcript',
      };
    }

    if (result.data.confidence < 0.6) {
      return {
        success: true,
        data: null,
        reason: 'Low confidence in voice analysis',
      };
    }

    return {
      success: true,
      data: {
        generalizedName: result.data.generalizedName,
        kcals: Math.round(result.data.kcals),
        protein: Math.round(result.data.protein * 10) / 10,
        fat: Math.round(result.data.fat * 10) / 10,
        carbs: Math.round(result.data.carbs * 10) / 10,
        fiber: Math.round(result.data.fiber * 10) / 10,
        descriptionForEmbedding: result.data.descriptionForEmbedding,
        confidence: result.data.confidence,
      },
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('analyzeVoiceForProduct error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function generateEmbeddingForProduct(text) {
  try {
    const result = await aiService.generateEmbedding(text);

    if (!result.success) {
      throw new Error(`Embeddings service error: ${result.error}`);
    }

    return {
      success: true,
      data: {
        embedding: result.data.embedding,
        dimensions: result.data.dimensions,
      },
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('generateEmbeddingForProduct error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export function isLLMAvailable() {
  return aiService.isAiEnabled();
}

export async function testLLMConnection() {
  try {
    const result = await aiService.testConnection();
    return result;
  } catch (error) {
    console.error('testLLMConnection error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
