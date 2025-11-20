// rename this to db-population-data.js

export const INIT_POPULATION_DATA = {
  moneyCurrency: [
    {
      id: 1,
      userId: 1,
      title: 'US Dollar',
      ticker: 'USD',
      symbol: '$',
      symbolPosEnum: 'before',
      whitespace: 0,
    },
  ],
};

export const USER_SETTINGS_DATA = {
  1: {
    sex: 'male',
    birthDate: '1990-05-23',
    activityLevel: 'moderate',
    goal: 'lose',
  },
  2: {
    sex: 'female',
    birthDate: '1985-03-14',
    activityLevel: 'low',
    goal: 'lose',
  },
  3: {
    sex: 'male',
    birthDate: '1995-11-22',
    activityLevel: 'high',
    goal: 'gain',
  },
};
