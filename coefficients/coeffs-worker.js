import { parentPort } from 'worker_threads';
import * as statsCache from '../api/food/stats-cache.js';
import * as dbFood from '../db/db-food.js';
import { COEFF_SETTINGS } from '../env.js';
import * as coefficientsService from './coeffs-service.js';
import * as dbCoefficients from './coeffs-db.js';

parentPort.on('message', async ({ userId }) => {
  if (!userId) {
    parentPort.postMessage({ status: 'error', error: 'No userId provided' });
    return;
  }

  try {
    console.log(`Starting coefficients calculation for user: ${userId}`);
    const startTime = Date.now();

    const [diaryEntriesRaw, weightsRaw, catalogueRaw] = await Promise.all([
      dbFood.getRangeOfUsersDiaryEntries(userId, '1970-01-01', '2100-01-01'),
      dbFood.getRangeOfUsersBodyWeightEntries(userId, '1970-01-01', '2100-01-01'),
      dbFood.getAllFoodCatalogueEntries(),
    ]);

    const [diaryEntriesPrepped, weightsPrepped, cataloguePrepped, personalCoeffs] = await Promise.all([
      coefficientsService.diaryEntriesPrep(diaryEntriesRaw),
      coefficientsService.weightsPrep(weightsRaw),
      coefficientsService.cataloguePrep(catalogueRaw),
      coefficientsService.getAndValidateCoefficients(userId, COEFF_SETTINGS.START_WITH_ZEROS),
    ]);

    const dailySumKcals = await coefficientsService.dailySumKcalsCount(diaryEntriesPrepped, cataloguePrepped, personalCoeffs);
    const catalogueFrequency = await coefficientsService.catalogueFrequencyPrep(personalCoeffs, diaryEntriesRaw);
    const dailySumKcalsAvg = coefficientsService.averageList(dailySumKcals, COEFF_SETTINGS.DAYS_7);
    const weightsPreppedAvg = coefficientsService.averageList(weightsPrepped, COEFF_SETTINGS.DAYS_7);
    const targetKcals = coefficientsService.targetKcalsPrep(dailySumKcalsAvg, weightsPreppedAvg, COEFF_SETTINGS.DAYS_7);

    const coeffsMainDict = Object.fromEntries(
      Array.from({ length: COEFF_SETTINGS.DIFFERENT_TRIES_PER_ROUND }, (_, i) => [
        i,
        coefficientsService.mutateCoeffs(personalCoeffs, catalogueFrequency),
      ])
    );

    let lap = 0,
      bestScore = 0,
      prevBestScore = 0,
      bestScoreCounter = 0;
    let topCoeff = {};

    while (bestScoreCounter < COEFF_SETTINGS.MAX_TRIES_IF_UNCHANGED) {
      const score = {};
      for (const [i, coeffs] of Object.entries(coeffsMainDict)) {
        const dailySumKcals = await coefficientsService.dailySumKcalsCount(diaryEntriesPrepped, cataloguePrepped, coeffs);
        const dailySumKcalsAvg = coefficientsService.averageList(dailySumKcals, COEFF_SETTINGS.DAYS_7);
        const targetKcalsEdgy = coefficientsService.targetKcalsPrep(dailySumKcalsAvg, weightsPreppedAvg, COEFF_SETTINGS.DAYS_7);
        const targetKcalsSmooth = coefficientsService.averageList(targetKcalsEdgy, COEFF_SETTINGS.DAYS_60);
        score[i] = coefficientsService.fitnessCalc(targetKcalsEdgy, targetKcalsSmooth, coeffs);
      }

      const bestCoeffs = Object.entries(score)
        .sort(([, a], [, b]) => a - b)
        .slice(0, COEFF_SETTINGS.BEST_AMT);
      bestScore = bestCoeffs[0][1];
      topCoeff = coeffsMainDict[bestCoeffs[0][0]];
      const bestCoeffsIds = bestCoeffs.map(([id]) => id);

      lap++;

      const coeffsMainDictNew = {};
      let j = 0;
      for (const coeffId of bestCoeffsIds) {
        coeffsMainDictNew[j] = coeffsMainDict[coeffId];
        j++;
        for (let k = 0; k < COEFF_SETTINGS.CHILDREN_AMT - 1; k++) {
          coeffsMainDictNew[j] = coefficientsService.mutateCoeffs(coeffsMainDict[coeffId], catalogueFrequency);
          j++;
        }
      }

      Object.assign(coeffsMainDict, coeffsMainDictNew);

      if (bestScore === prevBestScore) {
        bestScoreCounter++;
      } else {
        bestScoreCounter = 0;
      }
      prevBestScore = bestScore;
    }

    const topCoeffStr = JSON.stringify(topCoeff);
    const res = await dbCoefficients.setUsersCoefficients(userId, topCoeffStr);
    statsCache.clearCachedStats(userId);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`Coefficients calculated successfully for user: ${userId} (${lap} laps in ${duration} seconds)`);

    parentPort.postMessage({ status: 'success' });
  } catch (error) {
    console.error('Error calculating coefficients:', error);
    parentPort.postMessage({ status: 'error', error: error.message });
  }
});
