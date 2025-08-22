import OpenAI from 'openai';
import { AI_PROVIDERS } from '../../env.js';

const clients = {
  chat: null,
  embeddings: null,
  stt: null,
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
        'Максимально обобщенное название продукта на русском языке (например, "Яблоко" вместо "Яблоко Голден")',
    },
    kcals: {
      type: 'number',
      description: 'Калорийность на 100 грамм продукта',
    },
    protein: {
      type: 'number',
      description: 'Содержание белков в граммах на 100г продукта',
    },
    fat: {
      type: 'number',
      description: 'Содержание жиров в граммах на 100г продукта',
    },
    carbs: {
      type: 'number',
      description: 'Содержание углеводов в граммах на 100г продукта',
    },
    fiber: {
      type: 'number',
      description: 'Содержание клетчатки в граммах на 100г продукта (может быть 0)',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Уверенность модели в правильности данных от 0 до 1',
    },
    descriptionForEmbedding: {
      type: 'string',
      description: 'Краткое описание продукта для векторного поиска',
    },
  },
  required: ['generalizedName', 'kcals', 'protein', 'fat', 'carbs', 'fiber', 'confidence', 'descriptionForEmbedding'],
  additionalProperties: false,
};

const SYSTEM_PROMPT_GENERALIZE = `
  Ты - эксперт по питанию. Твоя задача - анализировать описания продуктов и создавать максимально обобщенные названия с точными данными КБЖУ.

  ВАЖНЫЕ ПРИНЦИПЫ:
  1. ОБОБЩЕНИЕ: Всегда используй родовые понятия вместо конкретных брендов или сортов
    - "Яблоко Голден" → "Яблоко"
    - "Творог Простоквашино 5%" → "Творог"
    - "Хлеб Дарницкий" → "Хлеб ржаной"

  2. РУССКИЙ ЯЗЫК: Все названия на русском языке

  3. УСРЕДНЕНИЕ КБЖУ: Если продукт может сильно варьироваться (например, творог 0-18% жирности), используй средние значения

  4. ТОЧНОСТЬ: Данные КБЖУ должны быть реалистичными и проверенными

  Верни JSON строго по схеме.
`;

const SYSTEM_PROMPT_IMAGE_ANALYSIS = `
  Ты - эксперт по анализу изображений продуктов питания. Твоя задача - определить, что за продукт изображен на фото, и дать максимально обобщенное название.

  ВАЖНЫЕ ПРИНЦИПЫ:
  1. ОБОБЩЕНИЕ: Не указывай бренды, конкретные сорта или марки
  2. РУССКИЙ ЯЗЫК: Все названия на русском языке
  3. КОНСЕРВАТИВНОСТЬ: Если не уверен, лучше назови более общую категорию

  Если на изображении НЕ ВИДНО продуктов питания или изображение неясное, верни null в поле generalizedName.

  Верни JSON строго по схеме.
`;

function validateNutritionData(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const requiredFields = [
    'generalizedName',
    'kcals',
    'protein',
    'fat',
    'carbs',
    'fiber',
    'confidence',
    'descriptionForEmbedding',
  ];

  for (const field of requiredFields) {
    if (!(field in data)) {
      return false;
    }
  }

  if (!data.generalizedName || typeof data.generalizedName !== 'string' || data.generalizedName.trim().length === 0) {
    return false;
  }

  const numericFields = ['kcals', 'protein', 'fat', 'carbs', 'fiber', 'confidence'];
  for (const field of numericFields) {
    if (typeof data[field] !== 'number' || isNaN(data[field]) || data[field] < 0) {
      return false;
    }
  }

  if (data.confidence > 1) {
    return false;
  }

  if (data.kcals > 1000 || data.protein > 100 || data.fat > 100 || data.carbs > 100 || data.fiber > 50) {
    return false;
  }

  if (!data.descriptionForEmbedding || typeof data.descriptionForEmbedding !== 'string') {
    return false;
  }

  return true;
}

async function callModelsInParallel(messages, responseFormat, useImageAnalysis = false) {
  const client = getClient('CHAT');
  const config = AI_PROVIDERS.TEXT_GEN;

  if (!client) throw new Error('Chat provider is disabled');

  const systemPrompt = useImageAnalysis ? SYSTEM_PROMPT_IMAGE_ANALYSIS : SYSTEM_PROMPT_GENERALIZE;
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

        if (!validateNutritionData(parsedData)) {
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

export async function generateGeneralizedProduct(description) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      throw new Error('Chat provider is disabled');
    }

    const messages = [
      {
        role: 'user',
        content: `Проанализируй описание продукта и создай обобщенное название с данными КБЖУ: "${description}"`,
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
    console.error('LLM generateGeneralizedProduct error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function analyzeImage(imageData, mimeType) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      throw new Error('Chat provider is disabled');
    }

    const base64Image = Buffer.from(imageData).toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Проанализируй это изображение и определи, какой продукт питания на нем изображен. Дай максимально обобщенное название и данные КБЖУ.',
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

    const result = await callModelsInParallel(messages, responseFormat, true);

    if (!result.data.generalizedName || result.data.confidence < 0.5) {
      return {
        success: true,
        data: null,
        reason: 'Low confidence or no food detected',
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
        content: `Проанализируй голосовой транскрипт и определи, какой продукт питания упоминается. Дай максимально обобщенное название и данные КБЖУ. Транскрипт: "${transcript}"`,
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

    if (!result.data.generalizedName || result.data.confidence < 0.6) {
      return {
        success: true,
        data: null,
        reason: 'Low confidence or no food detected in transcript',
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
    const config = AI_PROVIDERS.EMBEDDINGS;

    if (!config.ENABLED) {
      throw new Error('Embeddings provider is disabled');
    }

    const client = getClient('EMBEDDINGS');

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

export async function testConnection() {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      return {
        success: false,
        error: 'Chat provider is disabled',
      };
    }

    const client = getClient('CHAT');

    const response = await client.chat.completions.create({
      model: config.MODELS[0],
      messages: [
        { role: 'system', content: 'Ответь коротко на русском языке.' },
        { role: 'user', content: 'Привет! Это тест соединения.' },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });

    return {
      success: true,
      data: {
        response: response.choices[0].message.content,
        model: response.model,
      },
      metadata: {
        provider: config.PROVIDER,
        usage: response.usage,
      },
    };
  } catch (error) {
    console.error('LLM testConnection error:', error);
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
    embeddingProvider: AI_PROVIDERS.EMBEDDINGS.PROVIDER,
    sttProvider: AI_PROVIDERS.STT.PROVIDER,
    models: AI_PROVIDERS.TEXT_GEN.MODELS,
    embeddingModel: AI_PROVIDERS.EMBEDDINGS.MODEL,
    embeddingDimensions: AI_PROVIDERS.EMBEDDINGS.DIMENSIONS,
  };
}

export async function testMultipleModels(description) {
  try {
    const config = AI_PROVIDERS.TEXT_GEN;

    if (!config.ENABLED) {
      throw new Error('Chat provider is disabled');
    }

    const client = getClient('CHAT');

    const systemPrompt = `Ты - эксперт по питанию. Проанализируй описание продукта и создай максимально обобщенное название с данными КБЖУ.

      ВАЖНЫЕ ПРИНЦИПЫ:
      1. ОБОБЩЕНИЕ: Всегда используй родовые понятия вместо конкретных брендов
      2. РУССКИЙ ЯЗЫК: Все названия на русском языке
      3. КРАТКОСТЬ: Ответ должен быть коротким и по делу

      Верни JSON строго по схеме.
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Проанализируй продукт: "${description}"` },
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

          if (!validateNutritionData(parsedData)) {
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
