import fs from 'fs/promises';
import path from 'path';
import { LOG_FILE, LOG_LEVEL, LOG_SETTINGS } from '../env.js';

const LOG_LEVELS = {
  off: 0,
  error: 1,
  verbose: 2,
};

const currentLogLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.off; // off by default

function formatDate(date) {
  return date.toISOString();
}

async function writeToFile(message) {
  try {
    const logDir = path.dirname(LOG_FILE);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(LOG_FILE, message + '\n', 'utf8');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

function formatLogData(data) {
  if (!data) return '';

  if (data instanceof Error) {
    return data.stack || data.message;
  }

  if (typeof data === 'object') {
    const formatted = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'error' && (value instanceof Error || value?.stack)) {
        return value.stack || value.message;
      }
      formatted[key] = value;
    }
    try {
      return JSON.stringify(formatted);
    } catch (jsonError) {
      return `Error stringifying data: ${jsonError.message}`;
    }
  }

  return String(data);
}

async function mainLog(level, message, data) {
  if (currentLogLevel < level) {
    return;
  }

  const timestamp = formatDate(new Date());
  let logMessage = `[${timestamp}] [${Object.keys(LOG_LEVELS).find((key) => LOG_LEVELS[key] === level)}] - ${message}`;

  if (data) {
    logMessage += ` ${formatLogData(data)}`;
  }

  await writeToFile(logMessage);
}

function getRequestLogData(request) {
  const logData = {
    requestId: request.id,
    method: request.method,
    url: request.url,
    userId: request.user?.id,
    params: request.params,
    query: request.query,
  };

  if (LOG_SETTINGS.request.clientIp) {
    logData.clientIp = request.ip || request.ips || request.headers['x-forwarded-for'];
  }

  if (LOG_SETTINGS.request.userAgent) {
    logData.userAgent = request.headers['user-agent'];
  }

  if (LOG_SETTINGS.request.cookies) {
    logData.cookies = request.cookies;
  }

  if (LOG_SETTINGS.request.headers.security) {
    logData.securityHeaders = {
      authorization: request.headers.authorization ? '[PRESENT]' : undefined,
      'x-api-key': request.headers['x-api-key'] ? '[PRESENT]' : undefined,
    };
  }

  if (LOG_SETTINGS.request.headers.all) {
    logData.headers = request.headers;
  }

  if (request.headers['content-type']?.includes('multipart/form-data')) {
    logData.body = '[multipart/form-data]';
  } else {
    logData.body = request.body;
  }

  return logData;
}

function getResponseLogData(reply, responseTime) {
  const logData = {
    statusCode: reply.statusCode,
    responseTime: `${responseTime}ms`,
  };

  if (LOG_SETTINGS.response.size && reply.payload) {
    let size;
    if (typeof reply.payload === 'string') {
      size = Buffer.byteLength(reply.payload);
    } else if (Buffer.isBuffer(reply.payload)) {
      size = reply.payload.length;
    }
    if (size) {
      logData.responseSize = `${(size / 1024).toFixed(2)}KB`;
    }
  }

  return logData;
}

// Logging decorator:
export function log() {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      if (currentLogLevel >= LOG_LEVELS.verbose) {
        await mainLog(LOG_LEVELS.verbose, `Calling method: ${propertyKey}`, { arguments: args });
      }

      try {
        const result = await originalMethod.apply(this, args);
        if (currentLogLevel >= LOG_LEVELS.verbose) {
          await mainLog(LOG_LEVELS.verbose, `Method ${propertyKey} returned:`, { result });
        }
        return result;
      } catch (error) {
        await mainLog(LOG_LEVELS.error, `Method ${propertyKey} threw an error:`, {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    };

    return descriptor;
  };
}

export const loggingHooks = {
  onRequest: async (request, reply) => {
    request.requestStartTime = Date.now();
    await mainLog(LOG_LEVELS.verbose, 'Incoming request:', getRequestLogData(request));
  },

  onResponse: async (request, reply) => {
    const responseTime = Date.now() - request.requestStartTime;
    await mainLog(LOG_LEVELS.verbose, 'Request completed:', {
      ...getRequestLogData(request),
      ...getResponseLogData(reply, responseTime),
    });
  },

  onError: async (request, reply, error) => {
    const logData = {
      ...getRequestLogData(request),
      statusCode: reply.statusCode,
    };

    if (LOG_SETTINGS.auth.errors && error.name === 'AuthenticationError') {
      logData.authError = {
        message: error.message,
        code: error.code,
        details: error.details,
      };
    }

    await mainLog(LOG_LEVELS.error, 'Request error:', {
      ...logData,
      error: error,
    });
  },
};
