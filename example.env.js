// rename this to env.js

// APP
export const APP_IP = '127.0.0.1';
export const APP_PORT = 3000; // 3000 for prod, 3001 for dev
export const JWT_SECRET = 'jwt_secret_phrase_goes_here';
export const HEARTBEAT_INTERVAL = 30000;

// FOOD
export const FOOD_FETCH_DAYS_RANGE_OFFSET = 0;
export const FOOD_SEARCH_RESULTS_LIMIT = 20;

// DB
export const DB_NAME = 'db-name';
export const DB_ENV = 'prod';
export const DB_VERSION = '001';
export const DB_FILE_NAME = `${DB_NAME}-${DB_ENV}-${DB_VERSION}.db`; // WITH EXTENSION❗

// CRON
export const CRON_SCHEDULE = {
  COEFFS: '00 01 * * *', // Every day at 1 AM GMT
  BACKUP: '00 02 * * *', // Every day at 2 AM GMT
};

// AWS S3 BACKUP
export const S3_CONFIG = {
  ENABLED: true,
  TEMP_DIR: 'backups',
  REGION: 'eu-north-1',
  BUCKET_NAME: 'bucket-name',
  ACCESS_KEY_ID: 'iam-user-access-key-id',
  SECRET_ACCESS_KEY: 'iam-user-secret-access-key',
};

// LOGGING
export const LOG_LEVEL = 'verbose'; // possible values: 'off', 'error', 'verbose'
export const LOG_FILE = 'app.log';
export const LOG_SETTINGS = {
  request: {
    clientIp: true,
    userAgent: true,
    cookies: true,
    headers: {
      security: true,
      all: false,
    },
  },
  response: {
    size: true,
  },
  auth: {
    errors: true,
  },
};

// COEFFICIENTS GENERATION
export const COEFF_SETTINGS = {
  START_WITH_ZEROS: false,
  DIFFERENT_TRIES_PER_ROUND: 100,
  CHILDREN_AMT: 10,
  BEST_AMT: 10,
  DAYS_7: 7,
  DAYS_60: 60,
  MAX_TRIES_IF_UNCHANGED: 20,
};

// DEV-MODE
export const DEV_MODE = false; // For various database manipulations, disable in production❗
export const DEV_MODE_INIT_USERS = [
  // any users that need to be present after db creation; register to get hashedPassword
  {
    id: 0,
    username: 'admin',
    hashedPassword: '$2b$10$IZopuhO.eoXD1P2SmWQB1eMDBbgeCCYqZizkaV8fSQ7ZXZzF1enC2', // adminadmin
    isAdmin: 1,
  },
];
export const DEV_MODE_FORCE_RECREATE_TABLES = false;
export const DEV_MODE_TABLES_TO_DELETE = ['tableName01', 'tableName02'];
export const DEV_MODE_POPULATE_DB = false;

// AI SETTINGS
export const FOOD_SEARCH_NAME_WEIGHT = 0.7;
export const FOOD_SEARCH_DESCRIPTION_WEIGHT = 0.3;

export const AI_PROVIDERS = {
  TEXT_GENERATION: {
    PROVIDER: 'openrouter',
    API_KEY: 'YOUR_OPENROUTER_API_KEY',
    BASE_URL: 'https://openrouter.ai/api/v1',
    MODELS: [
      // best text models
      // 'openai/gpt-5',
      'google/gemini-2.5-pro',

      // cheap text models
      'openai/gpt-5-mini',
      'openai/gpt-4.1',
      'google/gemini-2.5-flash',
      'qwen/qwen3-coder',
      'qwen/qwen3-235b-a22b-2507',
      'deepseek/deepseek-chat-v3.1',

      // Non-working models
      // 'anthropic/claude-sonnet-4',
      // 'anthropic/claude-3.5-haiku',

      // free text models
      // 'qwen/qwen3-coder:free',
      'moonshotai/kimi-k2:free',
      'tngtech/deepseek-r1t2-chimera:free',
      'deepseek/deepseek-r1-0528:free',
      // 'deepseek/deepseek-chat-v3.1:free',
      // 'qwen/qwen3-235b-a22b:free',
      'meta-llama/llama-3.1-405b-instruct:free',
      'openai/gpt-oss-120b:free',
    ],
    TIMEOUT: 60000,
    MAX_TOKENS: 2048,
    TEMPERATURE: 0.1,
  },

  IMAGE_GENERATION: [
    {
      PROVIDER: 'openrouter',
      ENABLED: true,
      API_KEY: 'YOUR_OPENROUTER_API_KEY',
      BASE_URL: 'https://openrouter.ai/api/v1',
      MODELS: [
        'google/gemini-2.5-flash-image',
        // 'openai/gpt-5-image-mini',
      ],
    },
    {
      PROVIDER: 'naga',
      ENABLED: false,
      BASE_URL: 'https://api.naga.ac/v1/images/generations',
      API_KEY: 'YOUR_NAGA_API_KEY',
      MODELS: [
        // 'flux-1-schnell:free',
        // 'kandinsky-3.1:free',
        // 'sdxl:free',
        'dall-e-3:free',
        // 'sdxl',
        // 'midjourney',
      ],
    },
  ],

  IMAGE_RECOGNITION: {
    PROVIDER: 'openrouter',
    API_KEY: 'YOUR_OPENROUTER_API_KEY',
    BASE_URL: 'https://openrouter.ai/api/v1',
    MODELS: [],
    TIMEOUT: 30000,
    MAX_TOKENS: 2048,
    TEMPERATURE: 0.1,
  },

  EMBEDDINGS_NAGA: {
    PROVIDER: 'naga',
    API_KEY: 'YOUR_NAGA_API_KEY',
    BASE_URL: 'https://api.naga.ac/v1',
    MODEL: 'gemini-embedding-001',
    DIMENSIONS: 768,
  },

  EMBEDDINGS_OPENAI: {
    PROVIDER: 'openai',
    API_KEY: 'YOUR_OPENAI_API_KEY',
    BASE_URL: 'https://api.openai.com/v1',
    MODEL: 'text-embedding-3-small',
    DIMENSIONS: 768,
  },

  STT: {
    PROVIDER: 'openai',
    API_KEY: 'YOUR_OPENAI_API_KEY',
    BASE_URL: 'https://api.openai.com/v1',
    MODEL: 'whisper-1',
  },
};

export const AI_PROMPTS_PRODUCT_CREATION = {
  FROM_TEXT: {
    SYSTEM: `
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
    `,
    USER: `Проанализируй описание продукта и создай обобщенное название с данными КБЖУ: "{description}"`,
  },

  FROM_VOICE: {
    SYSTEM: `
      Ты - эксперт по питанию. Твоя задача - анализировать голосовые транскрипты и определять упоминаемые продукты питания с максимально обобщенными названиями и точными данными КБЖУ.

      ВАЖНЫЕ ПРИНЦИПЫ:
      1. ОБОБЩЕНИЕ: Всегда используй родовые понятия вместо конкретных брендов или сортов
      2. РУССКИЙ ЯЗЫК: Все названия на русском языке
      3. УСРЕДНЕНИЕ КБЖУ: Используй средние значения для типичного представителя категории
      4. ТОЧНОСТЬ: Данные КБЖУ должны быть реалистичными и проверенными

      Верни JSON строго по схеме.
    `,
    USER: `Проанализируй голосовой транскрипт и определи, какой продукт питания упоминается. Дай максимально обобщенное название и данные КБЖУ. Транскрипт: "{transcript}"`,
  },
};

export const AI_PROMPTS_IMAGE_RECOGNITION = {
  SIMPLE_MVP: {
    SYSTEM: `Определи название продукта питания на изображении. Ответь только названием на русском языке или "null".`,
    USER: `Какой продукт питания на фото?`,
  },

  FULL_WITH_NUTRITION: {
    SYSTEM: `
      Ты - помощник для распознавания продуктов питания на фотографиях и анализа их пищевой ценности.

      ТВОЯ ЗАДАЧА: Определить НАЗВАНИЕ продукта и его пищевую ценность (КБЖУ).

      ПРАВИЛА:
      1. Дай обобщённое название продукта на русском языке (например: "Яблоко", "Хлеб", "Молоко")
      2. НЕ указывай бренды, сорта или марки
      3. Определи приблизительные значения КБЖУ на 100г
      4. Если не видишь продукт питания - верни null

      ПРИМЕРЫ:
      - Яблоко любого сорта → "Яблоко"
      - Хлеб любой марки → "Хлеб"
      - Упакованный йогурт → "Йогурт"

      Верни JSON строго по схеме.
    `,
    USER: `Что это за продукт питания на фото? Назови только обобщённое название и определи КБЖУ.`,
  },
};

export const AI_PROMPTS_PRODUCT_GENERATION = {
  SYSTEM: `
    Ты эксперт по семантическому поиску продуктов питания и фуд-копирайтер.

    ТРЕБОВАНИЯ К ВЫВОДУ — СТРОГО JSON:
    1. Верни ТОЛЬКО чистый JSON объект без markdown блоков
    2. НЕ используй тройные обратные кавычки и никакое форматирование
    3. Начинай ответ с { и заканчивай }

    ОБЯЗАТЕЛЬНАЯ СТРУКТУРА:
    {
      "name": "текст",
      "description": "текст",
      "kcals": число,
      "protein": число,
      "fat": число,
      "carbs": число,
      "fiber": число
    }

    Все поля обязательны. Числовые значения могут быть целыми или десятичными (например, 2.5).

    ПРАВИЛА ГЕНЕРАЦИИ:
    • name — короткое, точное, 1–5 слов, без брендов и уточнений, отражает суть блюда.
      Пример: "Жареное мясо", "Салат Мимоза", "Творог 5%", "Курица тушёная".
    • description — 1–2 коротких предложения естественным языком, с упоминанием:
      – способа приготовления (если актуален);
      – 1–5 основных ингредиентов (без соли, специй и прочих незначительных компонентов);
      – категории блюда (например, мясное блюдо, салат, десерт).
      Избегай эпитетов вроде «вкусное», «домашнее», «ароматное».
    • kcals, protein, fat, carbs, fiber — реалистичные усреднённые значения на 100 г продукта.
    • Нули допустимы только если компонент реально отсутствует.

    ПОДСТРОЙКА ПОД ЦЕЛЬ:
    Если в пользовательском запросе упомянуто числовое значение (например, калорийность или количество белков, жиров и т.д.),
    скорректируй значения КБЖУ так, чтобы они соответствовали указанной цели.
    При этом сохраняй реалистичные пропорции для данного типа блюда.
  `,

  USER: `
    Сформируй данные для вот такого продукта: "{foodDescription}".
    Предоставь ясное название, полезное описание и усреднённые КБЖУ на 100 г. согласно структуре.
  `,

  MODELS: [
    'qwen/qwen3-coder',
    'deepseek/deepseek-chat-v3.1',
    'meta-llama/llama-3.1-405b-instruct',
    //
  ],
};

export const AI_PROMPTS_DEBUG = {
  NUTRITION_ANALYSIS: {
    SYSTEM: `
      Ты — эксперт-нутрициолог.

      ЦЕЛЬ: вернуть каноническое название с минимально необходимым обобщением (не слишком узким и не чрезмерно общим, без привязки к брендам).

      ПРАВИЛА:
      1. Сохраняй устойчивые и понятные термины, если они не бренды.
      2. Удаляй бренды и маркетинговые слова, оставляй суть продукта и ключевые атрибуты (тип, вкус, жирность).
      3. Если название слишком длинное, сленговое или с ненужными деталями — нормализуй до краткого, описательного.
      4. Обобщай только если исходное название неоднозначное.
      5. Не добавляй несуществующих характеристик. Не придумывай детали.
      6. Название должно быть на русском, кратким, без лишних слов («традиционный», «полезный» и т.п.).

      Верни JSON строго по заданной схеме.
    `,
    USER: `Проанализируй продукт: "{description}"`,
  },
};

export const AI_IMAGE_GENERATION = {
  FOOD_PRODUCT_PROMPT: `
    Абсолютно по центру изображения, идеально выровненный, крупный план продукта {productName}. {foodDescription}.
    Объект находится точно по центру на светлой, слегка потертой и теплой на вид деревянной поверхности или на тактильно
    гладком, но не глянцевом мраморе с мелкими включениями. Мягкий, обволакивающий естественный свет из окна,
    подсвечивающий микро-текстуры продукта, малая глубина резкости, создающая бархатное боке, уютная и чистая эстетика.
    Сфокусировано по центру. Рядом, очень незаметно, несколько минималистичных акцентов, тонко раскрывающих его
    природную сущность или характерную свежесть, создавая ощущение тепла и домашнего уюта.
  `,
};

// IMAGE GENERATION QUEUE
export const IMAGE_GEN_QUEUE_MAX_CONCURRENT = 5;
export const IMAGE_GEN_QUEUE_MAX_SIZE = 24;
export const IMAGE_GEN_QUEUE_RATE_LIMIT_SEC = 1;
export const IMAGE_GEN_QUEUE_MAX_ATTEMPTS = 1;
export const IMAGE_GEN_QUEUE_POLL_INTERVAL_MS = 100;
export const IMAGE_GEN_QUEUE_ERROR_BACKOFF_BASE_SEC = 1;
export const IMAGE_GEN_QUEUE_ERROR_BACKOFF_INCREMENT_SEC = 5;
export const IMAGE_GEN_QUEUE_ERROR_BACKOFF_MAX_SEC = 3600;
