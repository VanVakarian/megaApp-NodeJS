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

const responseWithTransactionIds = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        twinId: { type: 'integer' },
      },
    },
  },
};

const conflictResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
  },
};

const paramWithID = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '^[0-9]+$' },
  },
  required: ['id'],
};

//                                                        ~~~ ORGANIZATIONS ~~~

export const organizationSchemas = {
  getOrganizations: {
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
                logoBase64: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  },

  createOrganization: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        logoBase64: { type: 'string', nullable: true },
      },
      required: ['title'],
    },
    response: { 201: responseWithID },
  },

  updateOrganization: {
    tags: ['money'],
    params: paramWithID,
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        logoBase64: { type: 'string', nullable: true },
      },
      required: ['title'],
    },
    response: { 200: successResponse },
  },

  deleteOrganization: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse, 409: conflictResponse },
  },
};

//                                                            ~~~ CURRENCIES ~~~

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
    response: { 200: successResponse, 409: conflictResponse },
  },
};

//                                                            ~~~ CATEGORIES ~~~

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
                parentId: { type: 'integer', nullable: true },
                categoryType: { type: 'string', enum: ['income', 'expense'] },
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
        parentId: { type: 'integer' },
        categoryType: { type: 'string', enum: ['income', 'expense'] },
      },
      required: ['name', 'categoryType'],
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
        parentId: { type: 'integer' },
        categoryType: { type: 'string', enum: ['income', 'expense'] },
      },
      required: ['name', 'categoryType'],
    },
    response: { 200: successResponse },
  },

  deleteCategory: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse, 409: conflictResponse },
  },
};

//                                                              ~~~ ACCOUNTS ~~~

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
                isArchived: { type: 'boolean' },
                kind: { type: 'string', enum: ['cash', 'card', 'checking', 'deposit', 'brokerage', 'crypto'] },
                organizationId: { type: 'integer', nullable: true },
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
        isArchived: { type: 'boolean' },
        kind: { type: 'string', enum: ['cash', 'card', 'checking', 'deposit', 'brokerage', 'crypto'] },
        organizationId: { type: 'integer', nullable: true },
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
        isArchived: { type: 'boolean' },
        kind: { type: 'string', enum: ['cash', 'card', 'checking', 'deposit', 'brokerage', 'crypto'] },
        organizationId: { type: 'integer', nullable: true },
      },
      required: ['title', 'currencyId', 'kind'],
    },
    response: { 200: successResponse },
  },

  deleteAccount: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse, 409: conflictResponse },
  },
};

//                                                                ~~~ ASSETS ~~~

export const assetSchemas = {
  getAssets: {
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
                type: { type: 'string', enum: ['stock', 'bond', 'crypto'] },
                accountIds: {
                  type: 'array',
                  items: { type: 'integer' },
                  minItems: 1,
                },
                suspendedSince: { type: 'string', nullable: true },
                suspendedUntil: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  },

  createAsset: {
    tags: ['money'],
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ticker: { type: 'string' },
        type: { type: 'string', enum: ['stock', 'bond', 'crypto'] },
        accountIds: {
          type: 'array',
          items: { type: 'integer' },
          minItems: 1,
        },
        suspendedSince: { type: 'string', nullable: true },
        suspendedUntil: { type: 'string', nullable: true },
      },
      required: ['title', 'ticker', 'type', 'accountIds'],
    },
    response: { 201: responseWithID },
  },

  updateAsset: {
    tags: ['money'],
    params: paramWithID,
    body: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ticker: { type: 'string' },
        type: { type: 'string', enum: ['stock', 'bond', 'crypto'] },
        accountIds: {
          type: 'array',
          items: { type: 'integer' },
          minItems: 1,
        },
        suspendedSince: { type: 'string', nullable: true },
        suspendedUntil: { type: 'string', nullable: true },
      },
      required: ['title', 'ticker', 'type', 'accountIds'],
    },
    response: { 200: successResponse },
  },

  deleteAsset: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse, 409: conflictResponse },
  },
};

//                                                          ~~~ TRANSACTIONS ~~~

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
                categoryId: { type: 'integer', nullable: true },
                kind: {
                  type: 'string',
                  enum: ['income', 'expense', 'transfer', 'invest_buy', 'invest_sell', 'invest_dividend'],
                },
                isGift: { type: 'boolean' },
                notes: { type: 'string', nullable: true },
                detailsJSON: {
                  anyOf: [{ type: 'string' }, { type: 'object' }, { type: 'null' }],
                },
                twinId: { type: 'integer', nullable: true },
              },
            },
          },
        },
      },
    },
  },

  getInvestAssetTrades: {
    tags: ['money'],
    description: 'Returns invest buy/sell trades used to build opened positions on Assets tab',
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
                kind: { type: 'string', enum: ['invest_buy', 'invest_sell'] },
                notes: { type: 'string', nullable: true },
                detailsJSON: {
                  anyOf: [{ type: 'string' }, { type: 'object' }, { type: 'null' }],
                },
                assetId: { type: 'integer', nullable: true },
                assetTitle: { type: 'string', nullable: true },
                assetTicker: { type: 'string', nullable: true },
                assetType: { type: 'string', enum: ['stock', 'bond', 'crypto'], nullable: true },
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
        twinAccountId: { type: 'integer' },
        twinAmount: { type: 'number', minimum: 0 },
        categoryId: { type: 'integer' },
        kind: {
          type: 'string',
          enum: ['income', 'expense', 'transfer', 'invest_buy', 'invest_sell', 'invest_dividend'],
        },
        isGift: { type: 'boolean' },
        notes: { type: 'string' },
        detailsJSON: {
          type: 'object',
          properties: {
            assetId: { type: 'number' },
            quantity: { type: 'number' },
            price: { type: 'number' },
            commissionAmount: { type: 'number' },
            accruedInterestAmount: { type: 'number' },
          },
        },
      },
      required: ['dateISO', 'accountId', 'kind'],
    },
    response: { 201: responseWithTransactionIds },
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
        twinAccountId: { type: 'integer' },
        twinAmount: { type: 'number', minimum: 0 },
        categoryId: { type: 'integer' },
        kind: {
          type: 'string',
          enum: ['income', 'expense', 'transfer', 'invest_buy', 'invest_sell', 'invest_dividend'],
        },
        isGift: { type: 'boolean' },
        notes: { type: 'string' },
        detailsJSON: {
          type: 'object',
          properties: {
            assetId: { type: 'number' },
            quantity: { type: 'number' },
            price: { type: 'number' },
            commissionAmount: { type: 'number' },
            accruedInterestAmount: { type: 'number' },
          },
        },
      },
      required: ['dateISO', 'accountId', 'kind'],
    },
    response: { 200: successResponse },
  },

  deleteTransaction: {
    tags: ['money'],
    params: paramWithID,
    response: { 200: successResponse },
  },
};

export const rateHistorySchemas = {
  getRateHistory: {
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
                ratesJson: {
                  anyOf: [{ type: 'string' }, { type: 'object' }],
                },
              },
            },
          },
        },
      },
    },
  },
};
