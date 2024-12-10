import * as dbFood from '../../db/db-food.js';

// import { FOOD_FETCH_DAYS_RANGE_OFFSET } from '../../env.js';

export function getDateRange(dateIso, fetchDaysRangeOffset, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const date = new Date(dateIso);
  date.setUTCHours(userPreferredMidnightOffsetHours - userTZOffsetHours, 0, 0, 0);
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

export function organizeByDatesAndIds(inboundList, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const adjustedDate = adjustTimeToUserPreferences(food.date, userTZOffsetHours, userPreferredMidnightOffsetHours);
    const date = adjustedDate.toISOString().split('T')[0];
    const id = food.id;
    if (!resultDict[date]) {
      resultDict[date] = {};
    }
    resultDict[date][id] = food;
    resultDict[date][id].date = date;
    try {
      resultDict[date][id].history = JSON.parse(food.history);
    } catch (error) {
      resultDict[date][id].history = [];
    }
  });
  return resultDict;
}

export function extendDiary(targetDict, propertyName, value, valueIfNone) {
  for (const date in targetDict) {
    targetDict[date][propertyName] = value[date] || valueIfNone;
  }
  return targetDict;
}

export function organizeWeightsByDate(arrayOfWeights, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const resultDict = {};
  arrayOfWeights.forEach((weightObj) => {
    const adjustedDate = adjustTimeToUserPreferences(weightObj.date, userTZOffsetHours, userPreferredMidnightOffsetHours);
    const date = adjustedDate.toISOString().split('T')[0];
    resultDict[date] = weightObj.weight;
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

export async function calculateEntryTimestamp(dateIso, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const totalOffset = -userTZOffsetHours + userPreferredMidnightOffsetHours;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), totalOffset, 0, 0, 0));
  const inputDate = new Date(dateIso);
  inputDate.setUTCHours(totalOffset, 0, 0, 0);

  console.log('\n\ntoday', today);
  console.log('\n\ninputDate', inputDate);

  if (inputDate.getTime() === today.getTime()) {
    // Если дата сегодняшняя, возвращаем текущий timestamp в GMT без смещений
    return Math.floor(Date.now() / 1000);
  } else {
    // Если дата не сегодняшняя, находим последнюю запись за этот день с учетом смещений
    const startOfDay = Math.floor(inputDate.getTime() / 1000) - totalOffset * 3600;
    const endOfDay = startOfDay + 86399; // 23:59:59 того же дня

    console.log('\n\nstartOfDay', startOfDay);
    console.log('\n\nendOfDay', endOfDay);

    const entries = await dbFood.getDiaryEntriesForDay(startOfDay, endOfDay);
    console.log('\n\nentries', entries);

    if (entries.length > 0) {
      // Если записи существуют, возвращаем timestamp последней записи + 1 секунда
      const latestEntry = entries[entries.length - 1];
      console.log('\n\nlatestEntry', latestEntry);
      return latestEntry.date + 1;
    } else {
      // Если записей нет, возвращаем 10:00 AM входной даты в GMT
      return startOfDay + 36000; // 10 часов в секундах
    }
  }
}

function adjustTimeToUserPreferences(timestamp, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const date = new Date(timestamp * 1000);
  date.setUTCHours(date.getUTCHours() + userTZOffsetHours);

  if (date.getUTCHours() < userPreferredMidnightOffsetHours) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date;
}
