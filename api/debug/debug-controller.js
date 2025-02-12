import fs from 'fs/promises';
import path from 'path';
import { BACKUP_DIR_NAME, DO_BACKUP } from '../../env.js';
import * as backupDB from './db-debug.js';
import * as debugService from './debug-service.js';

export async function ping(request, reply) {
  const message = await debugService.ping();
  return reply.send({ message: message });
}

export async function restore(request, reply) {
  console.log('to be implemented...');
}

export async function backupDayData(lastDayOnly) {
  if (!DO_BACKUP) return;

  await fs.mkdir(BACKUP_DIR_NAME, { recursive: true });

  const allIsoDates = await backupDB.getAllDates();
  if (allIsoDates.length === 0 || !allIsoDates) return;

  const datesIsoList = lastDayOnly ? [allIsoDates.at(-1)] : [...allIsoDates];

  datesIsoList.forEach(async (isoDate) => {
    const fileName = `${isoDate}.json`;
    const filePath = path.join(BACKUP_DIR_NAME, fileName);

    const [foodDiary, bodyWeight] = await Promise.all([
      backupDB.getFoodDiaryByDate(isoDate),
      backupDB.getBodyWeightByDate(isoDate),
    ]);

    const backupData = {
      date: isoDate,
      foodDiary: foodDiary,
      bodyWeight: bodyWeight,
    };

    await fs.writeFile(filePath, JSON.stringify(backupData, null, 2));
  });
  console.log(`Backup saved successfully!`);
}
