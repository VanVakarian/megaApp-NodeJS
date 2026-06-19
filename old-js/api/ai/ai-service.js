import OpenAI from 'openai';
import {
  AI_PROMPTS_DEBUG,
  AI_PROMPTS_IMAGE_RECOGNITION,
  AI_PROMPTS_PRODUCT_CREATION,
  AI_PROMPTS_PRODUCT_GENERATION,
  AI_PROVIDERS,
} from '../../env.js';
import { tempPerfLog } from '../../perf-logger.js';

const clients = {
  TEXT_GENERATION: null,
  IMAGE_RECOGNITION: null,
  EMBEDDINGS: null,
  EMBEDDINGS_NAGA: null,
  EMBEDDINGS_OPENAI: null,
  STT: null,
};

function getClient(operationType) {
  const config = AI_PROVIDERS[operationType];

  if (!config) {
    throw new Error(`${operationType} provider config not found`);
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
    description: {
      type: 'string',
      description: 'Краткое описание продукта для векторного поиска (без брендов, без маркетинга)',
    },
  },
  required: ['generalizedName', 'kcals', 'protein', 'fat', 'carbs', 'fiber', 'description'],
  additionalProperties: false,
};

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

async function callModelsInParallel(messages, responseFormat) {
  const client = getClient('TEXT_GENERATION');
  const config = AI_PROVIDERS.TEXT_GENERATION;

  if (!client) throw new Error('Chat provider is disabled');

  const systemPrompt = AI_PROMPTS_PRODUCT_CREATION.FROM_TEXT.SYSTEM;
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

  const systemPrompt = AI_PROMPTS_IMAGE_RECOGNITION.FULL_WITH_NUTRITION.SYSTEM;
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
    const config = AI_PROVIDERS.TEXT_GENERATION;

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
    const config = AI_PROVIDERS.TEXT_GENERATION;

    const userPrompt = AI_PROMPTS_PRODUCT_GENERATION.USER.replace('{foodDescription}', description);

    for (const model of AI_PROMPTS_PRODUCT_GENERATION.MODELS) {
      const startTime = Date.now();
      const llmResult = await callOpenRouterDirectly({
        model: model,
        systemPrompt: AI_PROMPTS_PRODUCT_GENERATION.SYSTEM,
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
          description: parsedResult.data.description,
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

    const base64Image = Buffer.from(imageData).toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const messages = [
      {
        role: 'system',
        content: AI_PROMPTS_IMAGE_RECOGNITION.SIMPLE_MVP.SYSTEM,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: AI_PROMPTS_IMAGE_RECOGNITION.SIMPLE_MVP.USER,
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

    const base64Image = Buffer.from(imageData).toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: AI_PROMPTS_IMAGE_RECOGNITION.FULL_WITH_NUTRITION.USER,
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
    const config = AI_PROVIDERS.TEXT_GENERATION;

    const messages = [
      {
        role: 'user',
        content: AI_PROMPTS_PRODUCT_CREATION.FROM_VOICE.USER.replace('{transcript}', transcript),
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

    const client = getClient('EMBEDDINGS_OPENAI');

    const t0 = performance.now();
    const response = await client.embeddings.create({
      model: config.MODEL,
      input: text,
      dimensions: config.DIMENSIONS,
    });
    const t1 = performance.now();
    tempPerfLog(`OpenAI API call: ${(t1 - t0).toFixed(2)}ms | model: ${config.MODEL}`);

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

export function getAiConfig() {
  return {
    chatProvider: AI_PROVIDERS.TEXT_GENERATION.PROVIDER,
    embeddingProvider: AI_PROVIDERS.EMBEDDINGS_OPENAI.PROVIDER, // Primary embedding provider
    embeddingProviderNaga: AI_PROVIDERS.EMBEDDINGS_NAGA.PROVIDER,
    embeddingProviderOpenAI: AI_PROVIDERS.EMBEDDINGS_OPENAI.PROVIDER,
    sttProvider: AI_PROVIDERS.STT.PROVIDER,
    models: AI_PROVIDERS.TEXT_GENERATION.MODELS,
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
    const config = AI_PROVIDERS.TEXT_GENERATION;

    const client = getClient('TEXT_GENERATION');

    const messages = [
      { role: 'system', content: AI_PROMPTS_DEBUG.NUTRITION_ANALYSIS.SYSTEM },
      { role: 'user', content: AI_PROMPTS_DEBUG.NUTRITION_ANALYSIS.USER.replace('{description}', description) },
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

export async function generateImage(prompt) {
  const providers = AI_PROVIDERS.IMAGE_GENERATION;

  if (!providers || providers.length === 0) {
    return {
      success: false,
      error: 'No image generation providers configured',
    };
  }

  const activeProvider = providers.find((p) => p.ENABLED && p.MODELS && p.MODELS.length > 0);

  if (!activeProvider) {
    return {
      success: false,
      error: 'No active image generation providers found',
    };
  }

  console.log(`🎯 Selected provider: ${activeProvider.PROVIDER}`);

  switch (activeProvider.PROVIDER) {
    case 'openrouter':
      return await generateImageWithOpenRouter(prompt, activeProvider);
    case 'naga':
      return await generateImageWithNaga(prompt, activeProvider);
    default:
      return {
        success: false,
        error: `Unknown provider: ${activeProvider.PROVIDER}`,
      };
  }
}

export async function generateImageWithOpenRouter(prompt, config = null) {
  try {
    if (!config) {
      config = AI_PROVIDERS.IMAGE_GENERATION?.find((p) => p.PROVIDER === 'openrouter');
    }

    if (!config || !config.MODELS || config.MODELS.length === 0) {
      throw new Error('Image generation is disabled (no models configured)');
    }

    const model = config.MODELS[0];
    console.log(`🎨 Generating image via OpenRouter with model: ${model}`);

    const response = await fetch(config.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorData}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.images || data.choices[0].message.images.length === 0) {
      throw new Error('No image data in OpenRouter response');
    }

    const imageUrl = data.choices[0].message.images[0].image_url.url;

    if (!imageUrl.startsWith('data:image')) {
      throw new Error('Invalid image URL format from OpenRouter');
    }

    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Failed to parse base64 image data from OpenRouter');
    }

    const imageBuffer = Buffer.from(base64Match[2], 'base64');

    return {
      success: true,
      data: {
        imageBuffer,
        format: base64Match[1],
      },
      metadata: {
        model,
        provider: config.PROVIDER,
        usage: data.usage,
      },
    };
  } catch (error) {
    console.error('OpenRouter generateImage error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function generateImageWithNaga(prompt, config = null) {
  try {
    if (!config) {
      config = AI_PROVIDERS.IMAGE_GENERATION?.find((p) => p.PROVIDER === 'naga');
    }

    if (!config || !config.MODELS || config.MODELS.length === 0) {
      throw new Error('Naga image generation config not found or no models configured');
    }

    const model = config.MODELS[0];
    console.log(`🎨 Generating image via Naga with model: ${model}`);

    const response = await fetch(config.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Naga API error (${response.status}): ${errorData}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0 || !data.data[0].url) {
      throw new Error('No image URL in Naga response');
    }

    const imageUrl = data.data[0].url;
    console.log(`📥 Downloading image from: ${imageUrl}`);

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    return {
      success: true,
      data: {
        imageBuffer,
        format: 'png',
      },
      metadata: {
        model,
        provider: config.PROVIDER,
      },
    };
  } catch (error) {
    console.error('Naga generateImage error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
