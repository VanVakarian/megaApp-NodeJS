const successResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
  },
};

const responseWithID = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
      },
    },
  },
};

const paramWithID = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '^[0-9]+$' },
  },
  required: ['id'],
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                 ~~~ CURRENCIES ~~~                                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const currencySchemas = {
  getCurrencies: {
    tags: ['money'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                title: { type: 'string' },
                ticker: { type: 'string' },
                symbol: { type: 'string' },
                symbolPosEnum: { type: 'string', enum: ['before', 'after'] },
                whitespace: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },

  createCurrency: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ticker: { type: 'string' },
        symbol: { type: 'string' },
        symbolPosEnum: { type: 'string', enum: ['before', 'after'] },
        whitespace: { type: 'boolean' },
      },
      required: ['title', 'ticker', 'symbol', 'symbolPosEnum'],
    },
    response: { 201: responseWithID },
  },

  updateCurrency: {
    tags: ['money'],
    params: paramWithID,
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ticker: { type: 'string' },
        symbol: { type: 'string' },
        symbolPosEnum: { type: 'string', enum: ['before', 'after'] },
        whitespace: { type: 'boolean' },
      },
      required: ['title', 'ticker', 'symbol', 'symbolPosEnum'],
    },
    response: { 200: successResponse },
  },

  deleteCurrency: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse },
  },
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                 ~~~ CATEGORIES ~~~                                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const categorySchemas = {
  getCategories: {
    tags: ['money'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                usedFor: { type: 'string', enum: ['transaction', 'account', 'asset'] },
                groupKey: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  },

  createCategory: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        usedFor: { type: 'string', enum: ['transaction', 'account', 'asset'] },
        groupKey: { type: 'string' },
      },
      required: ['name', 'usedFor'],
    },
    response: { 201: responseWithID },
  },

  updateCategory: {
    tags: ['money'],
    params: paramWithID,
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        usedFor: { type: 'string', enum: ['transaction', 'account', 'asset'] },
        groupKey: { type: 'string' },
      },
      required: ['name', 'usedFor'],
    },
    response: { 200: successResponse },
  },

  deleteCategory: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse },
  },

  updateGroupKey: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        oldGroupKey: { type: 'string' },
        newGroupKey: { type: 'string' },
      },
      required: ['oldGroupKey', 'newGroupKey'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              affectedRows: { type: 'integer' },
            },
          },
        },
      },
    },
  },
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                  ~~~ ACCOUNTS ~~~                                                 ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const accountSchemas = {
  getAccounts: {
    tags: ['money'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                title: { type: 'string' },
                currencyId: { type: 'integer' },
                isInvest: { type: 'boolean' },
                kind: { type: 'string', enum: ['cash', 'card', 'checking', 'deposit', 'brokerage', 'crypto'] },
                categoryIds: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  },

  createAccount: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        currencyId: { type: 'integer' },
        isInvest: { type: 'boolean' },
        kind: { type: 'string', enum: ['cash', 'card', 'checking', 'deposit', 'brokerage', 'crypto'] },
        categoryIds: { type: 'array', items: { type: 'integer' } },
      },
      required: ['title', 'currencyId', 'kind'],
    },
    response: { 201: responseWithID },
  },

  updateAccount: {
    tags: ['money'],
    params: paramWithID,
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        currencyId: { type: 'integer' },
        isInvest: { type: 'boolean' },
        kind: { type: 'string', enum: ['cash', 'card', 'checking', 'deposit', 'brokerage', 'crypto'] },
        categoryIds: { type: 'array', items: { type: 'integer' } },
      },
      required: ['title', 'currencyId', 'kind'],
    },
    response: { 200: successResponse },
  },

  deleteAccount: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse },
  },
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                ~~~ TRANSACTIONS ~~~                                               ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const transactionSchemas = {
  getTransactions: {
    tags: ['money'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                dateISO: { type: 'string', format: 'date' },
                accountId: { type: 'integer' },
                amount: { type: 'number' },
                categoryIds: { type: 'string', nullable: true },
                kind: { type: 'string', enum: ['income', 'expense'] },
                isGift: { type: 'boolean' },
                notes: { type: 'string', nullable: true },
                details: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  },

  createTransaction: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        dateISO: { type: 'string', format: 'date' },
        accountId: { type: 'integer' },
        amount: { type: 'number', minimum: 0 },
        categoryIds: { type: 'array', items: { type: 'integer' } },
        kind: { type: 'string', enum: ['income', 'expense'] },
        isGift: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['dateISO', 'accountId', 'amount', 'kind'],
    },
    response: { 201: responseWithID },
  },

  updateTransaction: {
    tags: ['money'],
    params: paramWithID,
    body: {
      type: 'object',
      properties: {
        dateISO: { type: 'string', format: 'date' },
        accountId: { type: 'integer' },
        amount: { type: 'number', minimum: 0 },
        categoryIds: { type: 'array', items: { type: 'integer' } },
        kind: { type: 'string', enum: ['income', 'expense'] },
        isGift: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['dateISO', 'accountId', 'amount', 'kind'],
    },
    response: { 200: successResponse },
  },

  deleteTransaction: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse },
  },
};
