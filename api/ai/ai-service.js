import OpenAI from 'openai';
import {
  AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
  AI_FOOD_DESCRIPTION_MODELS,
  AI_FOOD_DESCRIPTION_USER_PROMPT,
  AI_PROMPTS,
  AI_PROVIDERS,
} from '../../env.js';

const clients = {
  TEXT_GEN: null,
  IMAGE_RECOGNITION: null,
  EMBEDDINGS: null,
  EMBEDDINGS_NAGA: null,
  EMBEDDINGS_OPENAI: null,
  STT: null,
};

function getClient(operationType) {
  const config = AI_PROVIDERS[operationType];

  if (!config?.ENABLED) {
    throw new Error(`${operationType} provider is disabled`);
  }

  if (!clients[operationType]) {
    clients[operationType] = new OpenAI({
      baseURL: config.BASE_URL,
      apiKey: config.API_KEY,
    });
  }

  return clients[operationType];
}

const FOOD_NUTRITION_SCHEMA = {
  type: 'object',
  properties: {
    generalizedName: {
      type: 'string',
      description:
        'Каноническое название продукта на русском языке с минимально необходимым обобщением (без брендов, без лишних слов, максимально отражающее суть продукта)',
    },
    kcals: {
      type: 'number',
      description: 'Калорийность на 100 грамм продукта',
    },
    protein: {
      type: 'number',
      description: 'Содержание белков в граммах на 100 г продукта',
    },
    fat: {
      type: 'number',
      description: 'Содержание жиров в граммах на 100 г продукта',
    },
    carbs: {
      type: 'number',
      description: 'Содержание углеводов в граммах на 100 г продукта',
    },
    fiber: {
      type: 'number',
      description: 'Содержание клетчатки в граммах на 100 г продукта',
    },
    descriptionForEmbedding: {
      type: 'string',
      description: 'Краткое описание продукта для векторного поиска (без брендов, без маркетинга)',
    },
  },
  required: ['generalizedName', 'kcals', 'protein', 'fat', 'carbs', 'fiber', 'descriptionForEmbedding'],
  additionalProperties: false,
};

function isNutritionDataValid(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const requiredFields = ['generalizedName', 'kcals', 'protein', 'fat', 'carbs', 'fiber', 'descriptionForEmbedding'];

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

  if (!data.descriptionForEmbedding || typeof data.descriptionForEmbedding !== 'string') {
    return false;
  }

  return true;
}

async function callModelsInParallel(messages, responseFormat) {
  const client = getClient('TEXT_GEN');
  const config = AI_PROVIDERS.TEXT_GEN;

  if (!client) throw new Error('Chat provider is disabled');

  const systemPrompt = AI_PROMPTS.SYSTEM_GENERALIZE;
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const calls = config.MODELS.map(async (model) => {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: fullMessages,
        temperature: config.TEMPERATURE,
        max_tokens: config.MAX_TOKENS,
        response_format: responseFormat,
      });

      return {
        model,
        success: true,
        data: response.choices?.[0]?.message?.content,
        usage: response.usage,
      };
    } catch (error) {
      return {
        model,
        success: false,
        error: error.message,
      };
    }
  });

  const results = await Promise.allSettled(calls);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      try {
        const parsedData = JSON.parse(result.value.data);

        if (!isNutritionDataValid(parsedData)) {
          console.warn(`Invalid nutrition data from model ${result.value.model}:`, parsedData);
          continue;
        }

        return {
          success: true,
          data: parsedData,
          model: result.value.model,
          usage: result.value.usage,
        };
      } catch (parseError) {
        console.warn(`JSON parse error from model ${result.value.model}:`, parseError.message);
        continue;
      }
    }
  }

  const errors = results
    .filter((r) => r.status === 'fulfilled' && !r.value.success)
    .map((r) => `${r.value.model}: ${r.value.error}`)
    .join('; ');

  throw new Error(`All LLM models failed or returned invalid data: ${errors}`);
}

async function callVisionModelsInParallel(messages, responseFormat) {
  const client = getClient('IMAGE_RECOGNITION');
  const config = AI_PROVIDERS.IMAGE_RECOGNITION;

  if (!client) throw new Error('Image recognition provider is disabled');

  const systemPrompt = AI_PROMPTS.SYSTEM_IMAGE_ANALYSIS;
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const calls = config.MODELS.map(async (model) => {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: fullMessages,
        temperature: config.TEMPERATURE,
        max_tokens: config.MAX_TOKENS,
        response_format: responseFormat,
      });

      return {
        model,
        success: true,
        data: response.choices?.[0]?.message?.content,
        usage: response.usage,
      };
    } catch (error) {
      return {
        model,
        success: false,
        error: error.message,
      };
    }
  });

  const results = await Promise.allSettled(calls);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      try {
        const parsedData = JSON.parse(result.value.data);

        if (!isNutritionDataValid(parsedData)) {
          console.warn(`Invalid nutrition data from model ${result.value.model}:`, parsedData);
          continue;
        }

        return {
          success: true,
          data: parsedData,
          model: result.value.model,
          usage: result.value.usage,
        };
      } catch (parseError) {
        console.warn(`JSON parse error from model ${result.value.model}:`, parseError.message);
        continue;
      }
    }
  }

  const errors = results
    .filter((r) => r.status === 'rejected' || !r.value.success)
    .map((r) => `${r.value.model}: ${r.value.error}`)
    .join('; ');

  throw new Error(`All vision models failed or returned invalid data: ${errors}`);
}

async function callSimpleVisionModels(messages) {
  const client = getClient('IMAGE_RECOGNITION');
  const config = AI_PROVIDERS.IMAGE_RECOGNITION;

  if (!client) throw new Error('Image recognition provider is disabled');

  const calls = config.MODELS.map(async (model) => {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: config.TEMPERATURE,
        max_tokens: config.MAX_TOKENS,
      });

      const content = response.choices[0].message.content.trim();

      return {
        success: true,
        model: model,
        data: content === 'null' ? null : content,
        usage: response.usage,
      };
    } catch (error) {
      return {
        success: false,
        model: model,
        error: error.message,
      };
    }
  });

  const results = await Promise.allSettled(calls);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success && result.value.data) {
      return {
        success: true,
        data: {
          productName: result.value.data,
        },
        metadata: {
          model: result.value.model,
          provider: config.PROVIDER,
          usage: result.value.usage,
        },
      };
    }
  }

  return {
    success: true,
    data: null,
    reason: 'No food product detected in image',
  };
}

function parseJSONWithMultipleStrategies(rawResponse) {
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
      const result = strategy.fn(rawResponse);

      if (!result.name || !result.description) {
        continue;
      }

      const hasKBJU =
        typeof result.kcals === 'number' &&
        typeof result.protein === 'number' &&
        typeof result.fat === 'number' &&
        typeof result.carbs === 'number' &&
        typeof result.fiber === 'number';

      if (!hasKBJU) {
        continue;
      }

      return {
        success: true,
        data: result,
        usedStrategy: strategy.name,
      };
    } catch (error) {
      continue;
    }
  }

  return {
    success: false,
    error: `All ${strategies.length} parsing strategies failed`,
    rawResponse: rawResponse.substring(0, 200) + '...',
  };
}

async function callOpenRouterDirectly({ model, systemPrompt, userPrompt }) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    const response = await fetch(config.BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: config.MAX_TOKENS,
        temperature: config.TEMPERATURE,
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

export async function generateGeneralizedProduct(description) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      throw new Error('Chat provider is disabled');
    }

    const userPrompt = AI_FOOD_DESCRIPTION_USER_PROMPT.replace('{originalName}', description).replace(
      '{originalDescription}',
      ''
    );

    for (const model of AI_FOOD_DESCRIPTION_MODELS) {
      const startTime = Date.now();
      const llmResult = await callOpenRouterDirectly({
        model: model,
        systemPrompt: AI_FOOD_DESCRIPTION_GEN_SYSTEM_PROMPT,
        userPrompt: userPrompt,
      });
      const responseTime = Date.now() - startTime;

      if (!llmResult.success) {
        continue;
      }

      const parsedResult = parseJSONWithMultipleStrategies(llmResult.data.content);

      if (!parsedResult.success) {
        continue;
      }

      if (parsedResult.data.name && parsedResult.data.description) {
        const nutritionData = {
          generalizedName: parsedResult.data.name,
          kcals: parsedResult.data.kcals,
          protein: parsedResult.data.protein,
          fat: parsedResult.data.fat,
          carbs: parsedResult.data.carbs,
          fiber: parsedResult.data.fiber,
          descriptionForEmbedding: parsedResult.data.description,
        };

        if (!isNutritionDataValid(nutritionData)) {
          continue;
        }

        return {
          success: true,
          data: nutritionData,
          metadata: {
            model: model,
            provider: config.PROVIDER,
            usage: llmResult.metadata?.usage,
            responseTime: responseTime,
            parsingStrategy: parsedResult.usedStrategy,
          },
        };
      }
    }

    throw new Error('All models failed to generate valid product data');
  } catch (error) {
    console.error('LLM generateGeneralizedProduct error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function simpleImageRecognition(imageData, mimeType) {
  try {
    const config = AI_PROVIDERS.IMAGE_RECOGNITION;

    if (!config.ENABLED) {
      return {
        success: false,
        error: 'Image recognition provider is disabled',
      };
    }

    const base64Image = Buffer.from(imageData).toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const messages = [
      {
        role: 'system',
        content: AI_PROMPTS.SYSTEM_IMAGE_RECOGNITION_MVP,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: AI_PROMPTS.USER_IMAGE_RECOGNITION_MVP,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'low',
            },
          },
        ],
      },
    ];

    return await callSimpleVisionModels(messages);
  } catch (error) {
    console.error('LLM simpleImageRecognition error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function analyzeImage(imageData, mimeType) {
  try {
    const config = AI_PROVIDERS.IMAGE_RECOGNITION;

    if (!config.ENABLED) {
      throw new Error('Vision provider is disabled');
    }

    const base64Image = Buffer.from(imageData).toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: AI_PROMPTS.USER_ANALYZE_IMAGE,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'low',
            },
          },
        ],
      },
    ];

    const responseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'food_nutrition',
        schema: FOOD_NUTRITION_SCHEMA,
      },
    };

    const result = await callVisionModelsInParallel(messages, responseFormat);

    if (!result.data.generalizedName) {
      return {
        success: true,
        data: null,
        reason: 'No food detected',
      };
    }

    return {
      success: true,
      data: result.data,
      metadata: {
        model: result.model,
        provider: config.PROVIDER,
        usage: result.usage,
      },
    };
  } catch (error) {
    console.error('LLM analyzeImage error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function analyzeVoiceTranscript(transcript) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      throw new Error('Chat provider is disabled');
    }

    const messages = [
      {
        role: 'user',
        content: AI_PROMPTS.USER_ANALYZE_VOICE.replace('{transcript}', transcript),
      },
    ];

    const responseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'food_nutrition',
        schema: FOOD_NUTRITION_SCHEMA,
      },
    };

    const result = await callModelsInParallel(messages, responseFormat);

    if (!result.data.generalizedName) {
      return {
        success: true,
        data: null,
        reason: 'No food detected in transcript',
      };
    }

    return {
      success: true,
      data: result.data,
      metadata: {
        model: result.model,
        provider: config.PROVIDER,
        usage: result.usage,
      },
    };
  } catch (error) {
    console.error('LLM analyzeVoiceTranscript error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function generateEmbedding(text) {
  try {
    const config = AI_PROVIDERS.EMBEDDINGS_OPENAI;

    if (!config.ENABLED) {
      throw new Error('Embeddings provider is disabled');
    }

    const client = getClient('EMBEDDINGS_OPENAI');

    const response = await client.embeddings.create({
      model: config.MODEL,
      input: text,
      dimensions: config.DIMENSIONS,
    });

    return {
      success: true,
      data: {
        embedding: response.data[0].embedding,
        dimensions: config.DIMENSIONS,
      },
      metadata: {
        model: config.MODEL,
        provider: config.PROVIDER,
        usage: response.usage,
      },
    };
  } catch (error) {
    console.error('Embeddings generateEmbedding error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function generateEmbeddingOpenAI(text) {
  try {
    const config = AI_PROVIDERS.EMBEDDINGS_OPENAI;

    if (!config.ENABLED) {
      throw new Error('OpenAI embeddings provider is disabled');
    }

    const client = getClient('EMBEDDINGS_OPENAI');

    const response = await client.embeddings.create({
      model: config.MODEL,
      input: text,
      dimensions: config.DIMENSIONS,
    });

    return {
      success: true,
      data: {
        embedding: response.data[0].embedding,
        dimensions: config.DIMENSIONS,
      },
      metadata: {
        model: config.MODEL,
        provider: config.PROVIDER,
        usage: response.usage,
      },
    };
  } catch (error) {
    console.error('OpenAI embeddings generateEmbeddingOpenAI error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export function isAiEnabled() {
  return AI_PROVIDERS.TEXT_GEN.ENABLED;
}

export function getAiConfig() {
  return {
    enabled: AI_PROVIDERS.TEXT_GEN.ENABLED,
    chatProvider: AI_PROVIDERS.TEXT_GEN.PROVIDER,
    embeddingProvider: AI_PROVIDERS.EMBEDDINGS_OPENAI.PROVIDER, // Primary embedding provider
    embeddingProviderNaga: AI_PROVIDERS.EMBEDDINGS_NAGA.PROVIDER,
    embeddingProviderOpenAI: AI_PROVIDERS.EMBEDDINGS_OPENAI.PROVIDER,
    sttProvider: AI_PROVIDERS.STT.PROVIDER,
    models: AI_PROVIDERS.TEXT_GEN.MODELS,
    embeddingModel: AI_PROVIDERS.EMBEDDINGS_OPENAI.MODEL, // Primary embedding model
    embeddingModelNaga: AI_PROVIDERS.EMBEDDINGS_NAGA.MODEL,
    embeddingModelOpenAI: AI_PROVIDERS.EMBEDDINGS_OPENAI.MODEL,
    embeddingDimensions: AI_PROVIDERS.EMBEDDINGS_OPENAI.DIMENSIONS, // Primary embedding dimensions
    embeddingDimensionsNaga: AI_PROVIDERS.EMBEDDINGS_NAGA.DIMENSIONS,
    embeddingDimensionsOpenAI: AI_PROVIDERS.EMBEDDINGS_OPENAI.DIMENSIONS,
  };
}

export async function runMultipleModels(description) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      throw new Error('Chat provider is disabled');
    }

    const client = getClient('TEXT_GEN');

    const messages = [
      { role: 'system', content: AI_PROMPTS.SYSTEM_PROMPT_NUTRITIONAL_VALUES },
      { role: 'user', content: AI_PROMPTS.USER_PROMPT_NUTRITIONAL_VALUES.replace('{description}', description) },
    ];

    const responseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'food_nutrition',
        schema: FOOD_NUTRITION_SCHEMA,
      },
    };

    const calls = config.MODELS.map(async (model) => {
      const startTime = Date.now();
      try {
        const response = await client.chat.completions.create({
          model,
          messages,
          temperature: config.TEMPERATURE,
          max_tokens: config.MAX_TOKENS,
          response_format: responseFormat,
        });

        const endTime = Date.now();

        try {
          const parsedData = JSON.parse(response.choices[0].message.content);

          if (!isNutritionDataValid(parsedData)) {
            return {
              model,
              success: false,
              error: 'Invalid nutrition data format',
              responseTime: endTime - startTime,
            };
          }

          return {
            model,
            success: true,
            data: parsedData,
            responseTime: endTime - startTime,
            usage: response.usage,
          };
        } catch (parseError) {
          return {
            model,
            success: false,
            error: `JSON parse error: ${parseError.message}`,
            responseTime: endTime - startTime,
          };
        }
      } catch (error) {
        const endTime = Date.now();
        return {
          model,
          success: false,
          error: error.message,
          responseTime: endTime - startTime,
        };
      }
    });

    const results = await Promise.allSettled(calls);

    const processedResults = results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          model: 'unknown',
          success: false,
          error: result.reason?.message || 'Promise rejected',
          responseTime: 0,
        };
      }
    });

    const successCount = processedResults.filter((r) => r.success).length;
    const avgResponseTime =
      processedResults.filter((r) => r.success).reduce((sum, r) => sum + r.responseTime, 0) / (successCount || 1);

    return {
      success: true,
      summary: {
        totalModels: config.MODELS.length,
        successfulModels: successCount,
        failedModels: config.MODELS.length - successCount,
        averageResponseTime: Math.round(avgResponseTime),
      },
      results: processedResults,
    };
  } catch (error) {
    console.error('LLM testMultipleModels error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
