import * as dbFood from '../../db/db-food.js';

// import { FOOD_FETCH_DAYS_RANGE_OFFSET } from '../../env.js';

export function getDateRange(dateIso, fetchDaysRangeOffset) {
  const date = new Date(dateIso);
  const result = [];
  for (let i = -fetchDaysRangeOffset; i <= fetchDaysRangeOffset; i++) {
    const d = new Date(date);
    d.setDate(date.getDate() + i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

// export function dictifyDatesList(datesList) {
//   return Object.fromEntries(datesList.map((date) => [date, {}]));
// }

export function organizeByDatesAndIds(inboundList) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const date = food.dateISO;
    const id = food.id;
    if (!resultDict[date]) {
      resultDict[date] = {};
    }
    resultDict[date][id] = {
      id: food.id,
      foodCatalogueId: food.foodCatalogueId,
      foodWeight: food.foodWeight,
      dateIso: date,
      history: [],
    };

    try {
      resultDict[date][id].history = JSON.parse(food.history);
    } catch (error) {
      // история уже инициализирована пустым массивом выше
    }
  });
  return resultDict;
}

export function extendDiary(targetDict, propertyName, value, defaultValue) {
  for (const date in targetDict) {
    targetDict[date][propertyName] = value[date] || defaultValue;
  }
  return targetDict;
}

export function organizeWeightsByDate(arrayOfWeights) {
  const resultDict = {};
  arrayOfWeights.forEach((weightObj) => {
    resultDict[weightObj.dateISO] = weightObj.weight;
  });
  return resultDict;
}

export async function formFoodCatalogue() {
  const foodCatalogueRaw = await dbFood.getAllFoodCatalogueEntries();
  const foodCataloguePrepped = prepFoodCatalogue(foodCatalogueRaw);
  return foodCataloguePrepped;
}

export function prepFoodCatalogue(catalogueArray) {
  const catalogueObj = {};
  for (const entry of catalogueArray) {
    catalogueObj[entry.id] = entry;
  }
  return catalogueObj;
}

export async function makeUpdatedHistoryString(diaryId, userId, newHistoryEntry) {
  const resHistory = await dbFood.dbGetDiaryEntriesHistory(diaryId, userId);
  const updatedHistory = resHistory.length ? JSON.parse(resHistory[0].history) : [];
  updatedHistory.push(newHistoryEntry);
  const historyString = JSON.stringify(updatedHistory);
  return historyString;
}

export async function updateDiaryEntryInDB(foodWeight, updatedHistory, diaryId, userId) {
  const historyString = JSON.stringify(updatedHistory);
  return await dbFood.dbEditDiaryEntry(foodWeight, historyString, diaryId, userId);
}

export async function calculateTargetKcals(userId, endDate) {
  const DAYS_AVG_7 = 7;
  const DAYS_AVG_60 = 60;
  const KCALS_IN_1_KG = 7700;

  const startDate = await dbFood.getUserFirstDate(userId);
  const diaryHistory = await dbFood.getDiaryEntriesHistory(userId, startDate, endDate);
  const weightHistory = await dbFood.getWeightHistory(userId, startDate, endDate);

  const dailyKcals = {};
  const dailyWeights = {};
  const targetKcals = {};
  const smoothedTargetKcals = {};

  weightHistory.forEach((entry) => {
    dailyWeights[entry.dateISO] = entry.weight;
  });

  diaryHistory.forEach((entry) => {
    if (!dailyKcals[entry.dateISO]) {
      dailyKcals[entry.dateISO] = 0;
    }
    dailyKcals[entry.dateISO] += (entry.foodWeight / 100) * entry.kcals;
  });

  const dates = Object.keys(dailyKcals).sort();

  for (let i = DAYS_AVG_7; i < dates.length; i++) {
    const currentDate = dates[i];
    const startIdx = i - DAYS_AVG_7;

    if (dailyWeights[currentDate] && dailyWeights[dates[startIdx]]) {
      const weightDiff = dailyWeights[currentDate] - dailyWeights[dates[startIdx]];
      const kcalsInPeriod = dates.slice(startIdx, i + 1).reduce((sum, date) => sum + (dailyKcals[date] || 0), 0);

      const avgDailyKcals = (kcalsInPeriod - weightDiff * KCALS_IN_1_KG) / DAYS_AVG_7;
      targetKcals[currentDate] = Math.round(avgDailyKcals);
    }
  }

  for (let i = DAYS_AVG_60; i < dates.length; i++) {
    const currentDate = dates[i];
    const startIdx = i - DAYS_AVG_60;

    const kcalsToAverage = dates
      .slice(startIdx, i + 1)
      .filter((date) => targetKcals[date])
      .map((date) => targetKcals[date]);

    if (kcalsToAverage.length > 0) {
      const avgKcals = kcalsToAverage.reduce((sum, kcals) => sum + kcals, 0) / kcalsToAverage.length;
      smoothedTargetKcals[currentDate] = Math.round(avgKcals);
    }
  }

  return smoothedTargetKcals;
}
