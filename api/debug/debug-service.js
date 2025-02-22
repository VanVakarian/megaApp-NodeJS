import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbSaveWalkSteps } from './db-debug.js';
// import { print } from '../../utils/debug-logger';

export async function ping() {
  return 'pong';
}

export async function csvToDb() {
  console.time('CSV to DB took:');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const csvPath = path.join(__dirname, '../../experiments/walk.csv');

  try {
    const data = await fs.readFile(csvPath, 'utf8');
    const lines = data.split('\n');

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;

      const values = line.split(',');
      const dateISO = values[0];
      const steps = parseInt(values[16]);

      if (dateISO && !isNaN(steps)) {
        await dbSaveWalkSteps(steps, dateISO, 1);
      }
    }

    // print('Records:', records);
    // console.log('records:', records);

    console.timeEnd('CSV to DB took:');
    return { success: true };
  } catch (error) {
    console.error('Error processing CSV:', error);
    throw error;
  }
}
