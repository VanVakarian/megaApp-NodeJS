// rename this to db-population-data.js

export const SEED_MONEY_DATA = {
  userId: 1,
  moneyCurrency: [
    {
      id: 1,
      title: 'US Dollar',
      ticker: 'USD',
      symbol: '$',
      symbolPosEnum: 'before',
      whitespace: 0,
    },
  ],
  moneyAccount: [
    {
      id: 1,
      title: 'My Brokerage Account',
      currencyId: 1,
      isInvest: 1,
      kind: 'brokerage',
    },
  ],
  moneyAsset: [
    { id: 1, ticker: 'SBER', title: 'Сбербанк', type: 'stock', accountId: 1 },
    { id: 2, ticker: '29012', title: 'ОФЗ-29012-ПК', type: 'bond', accountId: 1 },
  ],
};

export const USER_SETTINGS_DATA = {
  1: { sex: 'male', birthDate: '1990-05-23', activityLevel: 'moderate', goal: 'lose' },
  2: { sex: 'female', birthDate: '1985-03-14', activityLevel: 'low', goal: 'lose' },
  3: { sex: 'male', birthDate: '1995-11-22', activityLevel: 'high', goal: 'gain' },
};
