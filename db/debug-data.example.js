// rename this to debug-data.js

// any users that need to be present after db creation; register to get hashedPassword
export const INIT_USERS = [
  {
    id: 0,
    username: 'admin',
    hashedPassword: '$2b$10$IZopuhO.eoXD1P2SmWQB1eMDBbgeCCYqZizkaV8fSQ7ZXZzF1enC2', // adminadmin
    isAdmin: 1,
  },
];

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
