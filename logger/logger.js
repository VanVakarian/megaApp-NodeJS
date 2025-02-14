import fs from 'fs/promises';
import { LOG_FILE, LOG_LEVEL } from '../env.js';

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
    await fs.appendFile(LOG_FILE, message + '\n', 'utf8');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

function mainLog(level, message, data) {
  if (currentLogLevel < level) {
    return;
  }

  const timestamp = formatDate(new Date());
  let logMessage = `[${timestamp}] [${Object.keys(LOG_LEVELS).find((key) => LOG_LEVELS[key] === level)}] - ${message}`;

  if (data) {
    if (typeof data === 'object') {
      try {
        logMessage += `\n${JSON.stringify(data, null, 2)}`;
      } catch (jsonError) {
        logMessage += `\nError stringifying data: ${jsonError.message}`;
      }
    } else {
      logMessage += `\n${data}`;
    }
  }

  if (level === LOG_LEVELS.error) {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }

  writeToFile(logMessage);
}

// Logging decorator:
export function log() {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      if (currentLogLevel >= LOG_LEVELS.verbose) {
        mainLog(LOG_LEVELS.verbose, `Calling method: ${propertyKey}`, { arguments: args });
      }

      try {
        const result = await originalMethod.apply(this, args);
        if (currentLogLevel >= LOG_LEVELS.verbose) {
          mainLog(LOG_LEVELS.verbose, `Method ${propertyKey} returned:`, { result });
        }
        return result;
      } catch (error) {
        mainLog(LOG_LEVELS.error, `Method ${propertyKey} threw an error:`, {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    };

    return descriptor;
  };
}

// Logging middleware:
export function loggerMiddleware(request, reply, done) {
  const startTime = Date.now();

  if (currentLogLevel >= LOG_LEVELS.verbose) {
    mainLog(LOG_LEVELS.verbose, 'Incoming request:', {
      method: request.method,
      url: request.url,
      headers: request.headers,
      query: request.query,
      body: request.body, // TODO: Rethink, as it may be too big
    });
  }

  reply.then = (onResolve, onReject) => {
    Promise.resolve(reply.payload)
      .then((resolvedPayload) => {
        const responseTime = Date.now() - startTime;

        if (currentLogLevel >= LOG_LEVELS.verbose) {
          mainLog(LOG_LEVELS.verbose, 'Outgoing response:', {
            statusCode: reply.statusCode,
            responseTime: `${responseTime}ms`,
            // payload: resolvedPayload,  // TODO: Rethink, as it may take too long time
          });
        }

        onResolve(resolvedPayload);
      })
      .catch((e) => {
        if (onReject) {
          onReject(e);
        }
      });
  };

  done();
}

// Global error handler (uncaughtException)
process.on('uncaughtException', (err) => {
  mainLog(LOG_LEVELS.error, 'Uncaught Exception:', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Global error handler (unhandledRejection)
process.on('unhandledRejection', (reason, promise) => {
  mainLog(LOG_LEVELS.error, 'Unhandled Rejection:', {
    reason,
    promise,
  });
});
