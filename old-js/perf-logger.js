import { appendFileSync } from 'fs';

const PERF_LOG_FILE = 'temp-perf.log';

export function tempPerfLog(message) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} ⏱️ [PERF] ${message}\n`;
  try {
    appendFileSync(PERF_LOG_FILE, line);
  } catch (e) {}
}
