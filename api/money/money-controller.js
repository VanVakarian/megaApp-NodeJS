import * as dbMoney from '../../db/db-money.js';
import {
  ACCOUNT_KIND,
  ASSET_TYPE,
  CATEGORY_TYPE,
  isAccountKindValid,
  isAssetTypeValid,
  isCategoryTypeValid,
  isSymbolPositionValid,
  isTransactionKindValid,
  SYMBOL_POSITION,
  TRANSACTION_KIND,
} from './money-service.js';

//                                                            ~~~ CURRENCIES ~~~

export async function getCurrencies(request, reply) {
  try {
    const { user } = request;
    const currencies = await dbMoney.getAllCurrencies(user.id);

    reply.send({
      success: true,
      data: currencies,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to get currencies',
      message: error.message,
    });
  }
}

export async function createCurrency(request, reply) {
  try {
    const { user } = request;
    const { title, ticker, symbol, symbolPosEnum, whitespace } = request.body;

    const missingFields = [];

    if (!title) missingFields.push('title');
    if (!ticker) missingFields.push('ticker');
    if (!symbol) missingFields.push('symbol');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isSymbolPositionValid(symbolPosEnum)) {
      return reply.status(400).send({
        success: false,
        error: `symbolPosEnum must be either "${SYMBOL_POSITION.BEFORE}" or "${SYMBOL_POSITION.AFTER}"`,
      });
    }

    const currencyId = await dbMoney.createCurrency(title, ticker, symbol, symbolPosEnum, whitespace, user.id);

    reply.status(201).send({
      success: true,
      data: { id: currencyId },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to create currency',
      message: error.message,
    });
  }
}

export async function updateCurrency(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;
    const { title, ticker, symbol, symbolPosEnum, whitespace } = request.body;

    const missingFields = [];

    if (!title) missingFields.push('title');
    if (!ticker) missingFields.push('ticker');
    if (!symbol) missingFields.push('symbol');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isSymbolPositionValid(symbolPosEnum)) {
      return reply.status(400).send({
        success: false,
        error: `symbolPosEnum must be either "${SYMBOL_POSITION.BEFORE}" or "${SYMBOL_POSITION.AFTER}"`,
      });
    }

    const isCurrencyExist = await dbMoney.getCurrencyById(id, user.id);
    if (!isCurrencyExist) {
      return reply.status(404).send({
        success: false,
        error: 'Currency not found',
      });
    }

    const changedRows = await dbMoney.updateCurrency(id, title, ticker, symbol, symbolPosEnum, whitespace, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Currency not found',
      });
    }

    reply.send({
      success: true,
      message: 'Currency updated successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to update currency',
      message: error.message,
    });
  }
}

export async function deleteCurrency(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;

    const currency = await dbMoney.getCurrencyById(id, user.id);
    if (!currency) {
      return reply.status(404).send({
        success: false,
        error: 'Currency not found',
      });
    }

    const linkedAccountsCount = await dbMoney.countAccountsByCurrency(id, user.id);
    if (linkedAccountsCount > 0) {
      return reply.status(409).send({
        success: false,
        error: 'Currency is linked to existing accounts',
      });
    }

    const changedRows = await dbMoney.deleteCurrency(id, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Currency not found',
      });
    }

    reply.send({
      success: true,
      message: 'Currency deleted successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to delete currency',
      message: error.message,
    });
  }
}

//                                                            ~~~ CATEGORIES ~~~

export async function getCategories(request, reply) {
  try {
    const { user } = request;
    const categories = await dbMoney.getAllCategories(user.id);

    reply.send({
      success: true,
      data: categories,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to get categories',
      message: error.message,
    });
  }
}

export async function createCategory(request, reply) {
  try {
    const { user } = request;
    const { name, categoryType, parentId } = request.body;

    const missingFields = [];

    if (!name) missingFields.push('name');
    if (!categoryType) missingFields.push('categoryType');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isCategoryTypeValid(categoryType)) {
      return reply.status(400).send({
        success: false,
        error: `categoryType must be one of: ${Object.values(CATEGORY_TYPE).join(', ')}`,
      });
    }

    if (parentId) {
      const parentCategory = await dbMoney.getCategoryById(parentId, user.id);
      if (!parentCategory) {
        return reply.status(400).send({
          success: false,
          error: 'Parent category not found',
        });
      }

      if (parentCategory.categoryType !== categoryType) {
        return reply.status(400).send({
          success: false,
          error: 'Parent category type must match categoryType',
        });
      }
    }

    const categoryId = await dbMoney.createCategory(name, categoryType, parentId || null, user.id);

    reply.status(201).send({
      success: true,
      data: { id: categoryId },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to create category',
      message: error.message,
    });
  }
}

export async function updateCategory(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;
    const { name, categoryType, parentId } = request.body;

    const missingFields = [];

    if (!name) missingFields.push('name');
    if (!categoryType) missingFields.push('categoryType');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isCategoryTypeValid(categoryType)) {
      return reply.status(400).send({
        success: false,
        error: `categoryType must be one of: ${Object.values(CATEGORY_TYPE).join(', ')}`,
      });
    }

    const isCategoryExist = await dbMoney.getCategoryById(id, user.id);
    if (!isCategoryExist) {
      return reply.status(404).send({
        success: false,
        error: 'Category not found',
      });
    }

    if (parentId && Number(parentId) === Number(id)) {
      return reply.status(400).send({
        success: false,
        error: 'Parent category cannot be the same as the category',
      });
    }

    if (parentId) {
      const parentCategory = await dbMoney.getCategoryById(parentId, user.id);
      if (!parentCategory) {
        return reply.status(400).send({
          success: false,
          error: 'Parent category not found',
        });
      }

      if (parentCategory.categoryType !== categoryType) {
        return reply.status(400).send({
          success: false,
          error: 'Parent category type must match categoryType',
        });
      }
    }

    const changedRows = await dbMoney.updateCategory(id, name, categoryType, parentId || null, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Category not found',
      });
    }

    reply.send({
      success: true,
      message: 'Category updated successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to update category',
      message: error.message,
    });
  }
}

export async function deleteCategory(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;

    const category = await dbMoney.getCategoryById(id, user.id);
    if (!category) {
      return reply.status(404).send({
        success: false,
        error: 'Category not found',
      });
    }

    const childCategoriesCount = await dbMoney.countChildCategories(id, user.id);
    if (childCategoriesCount > 0) {
      return reply.status(409).send({
        success: false,
        error: 'Category has child categories',
      });
    }

    const linkedTransactionsCount = await dbMoney.countTransactionsByCategory(id, user.id);
    if (linkedTransactionsCount > 0) {
      return reply.status(409).send({
        success: false,
        error: 'Category is linked to existing transactions',
      });
    }

    const changedRows = await dbMoney.deleteCategory(id, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Category not found',
      });
    }

    reply.send({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to delete category',
      message: error.message,
    });
  }
}

//                                                              ~~~ ACCOUNTS ~~~

export async function getAccounts(request, reply) {
  try {
    const { user } = request;
    const accounts = await dbMoney.getAllAccounts(user.id);

    reply.send({
      success: true,
      data: accounts,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to get accounts',
      message: error.message,
    });
  }
}

export async function createAccount(request, reply) {
  try {
    const { user } = request;
    const { title, currencyId, isInvest, kind } = request.body;

    const missingFields = [];

    if (!title) missingFields.push('title');
    if (!currencyId) missingFields.push('currencyId');
    if (!kind) missingFields.push('kind');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isAccountKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be one of: ${Object.values(ACCOUNT_KIND).join(', ')}`,
      });
    }

    const accountId = await dbMoney.createAccount(title, currencyId, isInvest, kind, user.id);

    reply.status(201).send({
      success: true,
      data: { id: accountId },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to create account',
      message: error.message,
    });
  }
}

export async function updateAccount(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;
    const { title, currencyId, isInvest, kind } = request.body;

    const missingFields = [];

    if (!title) missingFields.push('title');
    if (!currencyId) missingFields.push('currencyId');
    if (!kind) missingFields.push('kind');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isAccountKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be one of: ${Object.values(ACCOUNT_KIND).join(', ')}`,
      });
    }

    const isAccountExist = await dbMoney.getAccountById(id, user.id);
    if (!isAccountExist) {
      return reply.status(404).send({
        success: false,
        error: 'Account not found',
      });
    }

    const changedRows = await dbMoney.updateAccount(id, title, currencyId, isInvest, kind, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Account not found',
      });
    }

    reply.send({
      success: true,
      message: 'Account updated successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to update account',
      message: error.message,
    });
  }
}

export async function deleteAccount(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;

    const account = await dbMoney.getAccountById(id, user.id);
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: 'Account not found',
      });
    }

    const linkedTransactionsCount = await dbMoney.countTransactionsByAccount(id, user.id);
    if (linkedTransactionsCount > 0) {
      return reply.status(409).send({
        success: false,
        error: 'Account is linked to existing transactions',
      });
    }

    const linkedAssetsCount = await dbMoney.countAssetsByAccount(id, user.id);
    if (linkedAssetsCount > 0) {
      return reply.status(409).send({
        success: false,
        error: 'Account is linked to existing assets',
      });
    }

    const changedRows = await dbMoney.deleteAccount(id, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Account not found',
      });
    }

    reply.send({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to delete account',
      message: error.message,
    });
  }
}

//                                                                ~~~ ASSETS ~~~

export async function getAssets(request, reply) {
  try {
    const { user } = request;
    const assets = await dbMoney.getAllAssets(user.id);
    const normalizedAssets = assets.map((asset) => normalizeAssetFromDB(asset));

    reply.send({
      success: true,
      data: normalizedAssets,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to get assets',
      message: error.message,
    });
  }
}

export async function createAsset(request, reply) {
  try {
    const { user } = request;
    const { title, ticker, type, accountIds } = request.body;

    const missingFields = [];

    if (!title) missingFields.push('title');
    if (!ticker) missingFields.push('ticker');
    if (!type) missingFields.push('type');
    if (!accountIds) missingFields.push('accountIds');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isAssetTypeValid(type)) {
      return reply.status(400).send({
        success: false,
        error: `type must be one of: ${Object.values(ASSET_TYPE).join(', ')}`,
      });
    }

    const normalizedAccountIds = normalizeAccountIds(accountIds);
    if (normalizedAccountIds.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'accountIds must contain at least one brokerage account id',
      });
    }

    for (const currentAccountId of normalizedAccountIds) {
      const account = await dbMoney.getAccountById(currentAccountId, user.id);
      if (!account) {
        return reply.status(400).send({
          success: false,
          error: `Account not found: ${currentAccountId}`,
        });
      }

      if (account.kind !== ACCOUNT_KIND.BROKERAGE) {
        return reply.status(400).send({
          success: false,
          error: `Asset account must be brokerage: ${currentAccountId}`,
        });
      }
    }

    const accountIdsJSON = JSON.stringify(normalizedAccountIds);
    const assetId = await dbMoney.createAsset(title, ticker, type, accountIdsJSON, user.id);

    reply.status(201).send({
      success: true,
      data: { id: assetId },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to create asset',
      message: error.message,
    });
  }
}

export async function updateAsset(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;
    const { title, ticker, type, accountIds } = request.body;

    const missingFields = [];

    if (!title) missingFields.push('title');
    if (!ticker) missingFields.push('ticker');
    if (!type) missingFields.push('type');
    if (!accountIds) missingFields.push('accountIds');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isAssetTypeValid(type)) {
      return reply.status(400).send({
        success: false,
        error: `type must be one of: ${Object.values(ASSET_TYPE).join(', ')}`,
      });
    }

    const existingAssetRaw = await dbMoney.getAssetById(id, user.id);
    const existingAsset = normalizeAssetFromDB(existingAssetRaw);
    if (!existingAsset) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }

    const normalizedAccountIds = normalizeAccountIds(accountIds);
    if (normalizedAccountIds.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'accountIds must contain at least one brokerage account id',
      });
    }

    for (const currentAccountId of normalizedAccountIds) {
      const account = await dbMoney.getAccountById(currentAccountId, user.id);
      if (!account) {
        return reply.status(400).send({
          success: false,
          error: `Account not found: ${currentAccountId}`,
        });
      }

      if (account.kind !== ACCOUNT_KIND.BROKERAGE) {
        return reply.status(400).send({
          success: false,
          error: `Asset account must be brokerage: ${currentAccountId}`,
        });
      }
    }

    if (!isSameIdList(existingAsset.accountIds, normalizedAccountIds)) {
      const linkedAccountIds = await dbMoney.getLinkedTransactionAccountIdsByAsset(id, user.id);
      const isAnyLinkedAccountRemoved = linkedAccountIds.some(
        (linkedAccountId) => !normalizedAccountIds.includes(Number(linkedAccountId)),
      );

      if (isAnyLinkedAccountRemoved) {
        return reply.status(409).send({
          success: false,
          error: 'Asset accounts linked to existing transactions cannot be removed',
        });
      }
    }

    const accountIdsJSON = JSON.stringify(normalizedAccountIds);
    const changedRows = await dbMoney.updateAsset(id, title, ticker, type, accountIdsJSON, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }

    reply.send({
      success: true,
      message: 'Asset updated successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to update asset',
      message: error.message,
    });
  }
}

export async function deleteAsset(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;

    const asset = await dbMoney.getAssetById(id, user.id);
    if (!asset) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }

    const linkedTransactionsCount = await dbMoney.countTransactionsByAsset(id, user.id);
    if (linkedTransactionsCount > 0) {
      return reply.status(409).send({
        success: false,
        error: 'Asset is linked to existing transactions',
      });
    }

    const changedRows = await dbMoney.deleteAsset(id, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }

    reply.send({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to delete asset',
      message: error.message,
    });
  }
}

//                                                          ~~~ TRANSACTIONS ~~~

export async function getTransactions(request, reply) {
  try {
    const { user } = request;
    const transactions = await dbMoney.getAllTransactions(user.id);

    reply.send({
      success: true,
      data: transactions,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to get transactions',
      message: error.message,
    });
  }
}

export async function getInvestAssetTrades(request, reply) {
  try {
    const { user } = request;
    const trades = await dbMoney.getInvestAssetTrades(user.id);

    reply.send({
      success: true,
      data: trades,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to get invest asset trades',
      message: error.message,
    });
  }
}

export async function getRateHistory(request, reply) {
  try {
    const rateHistory = await dbMoney.getAllRateHistory();
    const payload = Array.isArray(rateHistory) ? rateHistory : [];

    return reply.code(200).send({
      success: true,
      data: payload,
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: 'Failed to get money rate history',
      message: error.message,
    });
  }
}

export async function createTransaction(request, reply) {
  try {
    const { user } = request;
    const { dateISO, accountId, amount, twinAccountId, twinAmount, categoryId, kind, isGift, notes, detailsJSON } =
      request.body;

    const missingFields = [];

    if (!dateISO) missingFields.push('dateISO');
    if (!accountId) missingFields.push('accountId');
    if (!kind) missingFields.push('kind');

    const isInvestKind = [
      TRANSACTION_KIND.INVEST_BUY,
      TRANSACTION_KIND.INVEST_SELL,
      TRANSACTION_KIND.INVEST_DIVIDEND,
    ].includes(kind);

    if (!isInvestKind && kind !== TRANSACTION_KIND.TRANSFER && !amount) {
      missingFields.push('amount');
    }

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isTransactionKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be one of: ${Object.values(TRANSACTION_KIND).join(', ')}`,
      });
    }

    if (kind === TRANSACTION_KIND.TRANSFER) {
      if (!amount) missingFields.push('amount');
      if (!twinAccountId) missingFields.push('twinAccountId');
      if (!twinAmount) missingFields.push('twinAmount');

      if (missingFields.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
        });
      }

      if (amount <= 0 || twinAmount <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'amount must be greater than 0',
        });
      }

      if (Number(accountId) === Number(twinAccountId)) {
        return reply.status(400).send({
          success: false,
          error: 'Transfer accounts must be different',
        });
      }

      if (categoryId) {
        return reply.status(400).send({
          success: false,
          error: 'Category is not allowed for transfer',
        });
      }

      const fromAccount = await dbMoney.getAccountById(accountId, user.id);
      if (!fromAccount) {
        return reply.status(400).send({
          success: false,
          error: 'Account not found',
        });
      }

      const toAccount = await dbMoney.getAccountById(twinAccountId, user.id);
      if (!toAccount) {
        return reply.status(400).send({
          success: false,
          error: 'Account not found',
        });
      }

      const { fromId, toId } = await dbMoney.createTransferTransactions(
        dateISO,
        accountId,
        amount,
        twinAccountId,
        twinAmount,
        notes || null,
        user.id,
      );

      reply.status(201).send({
        success: true,
        data: { id: fromId, twinId: toId },
      });

      return;
    }

    const account = await dbMoney.getAccountById(accountId, user.id);
    if (!account) {
      return reply.status(400).send({
        success: false,
        error: 'Account not found',
      });
    }

    if (isInvestKind) {
      if (account.kind !== ACCOUNT_KIND.BROKERAGE) {
        return reply.status(400).send({
          success: false,
          error: 'Invest transaction requires brokerage account',
        });
      }

      if (categoryId) {
        return reply.status(400).send({
          success: false,
          error: 'Category is not allowed for invest transactions',
        });
      }

      const parsedDetails = normalizeDetailsJSON(detailsJSON);
      if (!parsedDetails) {
        return reply.status(400).send({
          success: false,
          error: 'detailsJSON is required for invest transactions',
        });
      }

      const assetId = Number(parsedDetails.assetId);
      if (!Number.isFinite(assetId) || assetId <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'detailsJSON.assetId must be a positive number',
        });
      }

      const assetRaw = await dbMoney.getAssetById(assetId, user.id);
      const asset = normalizeAssetFromDB(assetRaw);
      if (!asset) {
        return reply.status(400).send({
          success: false,
          error: 'Asset not found',
        });
      }

      if (!assetHasAccountId(asset, accountId)) {
        return reply.status(400).send({
          success: false,
          error: 'Asset does not belong to selected account',
        });
      }

      const investValidation = validateInvestPayload({
        kind,
        amount,
        detailsJSON: parsedDetails,
        assetType: asset.type,
      });

      if (!investValidation.success) {
        return reply.status(400).send({
          success: false,
          error: investValidation.error,
        });
      }

      const transactionId = await dbMoney.createTransaction(
        dateISO,
        accountId,
        investValidation.amount,
        null,
        kind,
        false,
        notes || null,
        JSON.stringify(investValidation.detailsJSON),
        user.id,
      );

      reply.status(201).send({
        success: true,
        data: { id: transactionId },
      });

      return;
    }

    if (amount <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'amount must be greater than 0',
      });
    }

    if (categoryId) {
      const category = await dbMoney.getCategoryById(categoryId, user.id);
      if (!category) {
        return reply.status(400).send({
          success: false,
          error: 'Category not found',
        });
      }

      if (category.categoryType !== kind) {
        return reply.status(400).send({
          success: false,
          error: 'Category type must match transaction kind',
        });
      }

      if (category.parentId) {
        const parentCategory = await dbMoney.getCategoryById(category.parentId, user.id);
        if (!parentCategory || parentCategory.categoryType !== kind) {
          return reply.status(400).send({
            success: false,
            error: 'Category parent must match transaction kind',
          });
        }
      }
    }

    const isGiftBoolean = isGift === true || isGift === 'true';

    const transactionId = await dbMoney.createTransaction(
      dateISO,
      accountId,
      amount,
      categoryId || null,
      kind,
      isGiftBoolean,
      notes || null,
      null,
      user.id,
    );

    reply.status(201).send({
      success: true,
      data: { id: transactionId },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to create transaction',
      message: error.message,
    });
  }
}

export async function updateTransaction(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;
    const { dateISO, accountId, amount, twinAccountId, twinAmount, categoryId, kind, isGift, notes, detailsJSON } =
      request.body;

    const missingFields = [];

    if (!dateISO) missingFields.push('dateISO');
    if (!accountId) missingFields.push('accountId');
    if (!kind) missingFields.push('kind');

    const isInvestKind = [
      TRANSACTION_KIND.INVEST_BUY,
      TRANSACTION_KIND.INVEST_SELL,
      TRANSACTION_KIND.INVEST_DIVIDEND,
    ].includes(kind);

    if (!isInvestKind && kind !== TRANSACTION_KIND.TRANSFER && !amount) {
      missingFields.push('amount');
    }

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isTransactionKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be one of: ${Object.values(TRANSACTION_KIND).join(', ')}`,
      });
    }

    const existingTransaction = await dbMoney.getTransactionById(id, user.id);
    if (!existingTransaction) {
      return reply.status(404).send({
        success: false,
        error: 'Transaction not found',
      });
    }

    if (existingTransaction.kind === TRANSACTION_KIND.TRANSFER) {
      if (!amount) missingFields.push('amount');
      if (!twinAccountId) missingFields.push('twinAccountId');
      if (!twinAmount) missingFields.push('twinAmount');

      if (missingFields.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
        });
      }

      if (kind !== TRANSACTION_KIND.TRANSFER) {
        return reply.status(400).send({
          success: false,
          error: 'Transaction kind cannot be changed',
        });
      }

      if (amount <= 0 || twinAmount <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'amount must be greater than 0',
        });
      }

      if (categoryId) {
        return reply.status(400).send({
          success: false,
          error: 'Category is not allowed for transfer',
        });
      }

      if (Number(accountId) !== Number(existingTransaction.accountId)) {
        return reply.status(400).send({
          success: false,
          error: 'Account cannot be changed',
        });
      }

      if (!existingTransaction.twinId) {
        return reply.status(400).send({
          success: false,
          error: 'Transfer pair is missing',
        });
      }

      const twinTransaction = await dbMoney.getTransactionById(existingTransaction.twinId, user.id);
      if (!twinTransaction) {
        return reply.status(400).send({
          success: false,
          error: 'Transfer pair is missing',
        });
      }

      if (Number(twinAccountId) !== Number(twinTransaction.accountId)) {
        return reply.status(400).send({
          success: false,
          error: 'Account cannot be changed',
        });
      }

      const changedRows = await dbMoney.updateTransferTransactions(
        existingTransaction.id,
        twinTransaction.id,
        dateISO,
        amount,
        twinAmount,
        notes || null,
        user.id,
      );

      if (changedRows === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Transaction not found',
        });
      }

      reply.send({
        success: true,
        message: 'Transaction updated successfully',
      });

      return;
    }

    if (isInvestKind) {
      if (kind !== existingTransaction.kind) {
        return reply.status(400).send({
          success: false,
          error: 'Transaction kind cannot be changed',
        });
      }

      if (Number(accountId) !== Number(existingTransaction.accountId)) {
        return reply.status(400).send({
          success: false,
          error: 'Account cannot be changed',
        });
      }

      if (categoryId) {
        return reply.status(400).send({
          success: false,
          error: 'Category is not allowed for invest transactions',
        });
      }

      const account = await dbMoney.getAccountById(accountId, user.id);
      if (!account) {
        return reply.status(400).send({
          success: false,
          error: 'Account not found',
        });
      }

      if (account.kind !== ACCOUNT_KIND.BROKERAGE) {
        return reply.status(400).send({
          success: false,
          error: 'Invest transaction requires brokerage account',
        });
      }

      const parsedDetails = normalizeDetailsJSON(detailsJSON);
      if (!parsedDetails) {
        return reply.status(400).send({
          success: false,
          error: 'detailsJSON is required for invest transactions',
        });
      }

      const existingDetails = normalizeDetailsJSON(existingTransaction.detailsJSON);
      const nextAssetId = Number(parsedDetails.assetId);
      const prevAssetId = Number(existingDetails?.assetId);

      if (!Number.isFinite(nextAssetId) || nextAssetId <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'detailsJSON.assetId must be a positive number',
        });
      }

      if (!Number.isFinite(prevAssetId) || prevAssetId <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'Existing invest transaction has invalid asset binding',
        });
      }

      if (nextAssetId !== prevAssetId) {
        return reply.status(400).send({
          success: false,
          error: 'Asset cannot be changed',
        });
      }

      const assetRaw = await dbMoney.getAssetById(nextAssetId, user.id);
      const asset = normalizeAssetFromDB(assetRaw);
      if (!asset) {
        return reply.status(400).send({
          success: false,
          error: 'Asset not found',
        });
      }

      if (!assetHasAccountId(asset, accountId)) {
        return reply.status(400).send({
          success: false,
          error: 'Asset does not belong to selected account',
        });
      }

      const investValidation = validateInvestPayload({
        kind,
        amount,
        detailsJSON: parsedDetails,
        assetType: asset.type,
      });

      if (!investValidation.success) {
        return reply.status(400).send({
          success: false,
          error: investValidation.error,
        });
      }

      const changedRows = await dbMoney.updateTransaction(
        id,
        dateISO,
        accountId,
        investValidation.amount,
        null,
        kind,
        false,
        notes || null,
        JSON.stringify(investValidation.detailsJSON),
        user.id,
      );

      if (changedRows === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Transaction not found',
        });
      }

      reply.send({
        success: true,
        message: 'Transaction updated successfully',
      });

      return;
    }

    if (kind !== existingTransaction.kind) {
      return reply.status(400).send({
        success: false,
        error: 'Transaction kind cannot be changed',
      });
    }

    if (Number(accountId) !== Number(existingTransaction.accountId)) {
      return reply.status(400).send({
        success: false,
        error: 'Account cannot be changed',
      });
    }

    if (amount <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'amount must be greater than 0',
      });
    }

    if (categoryId) {
      const category = await dbMoney.getCategoryById(categoryId, user.id);
      if (!category) {
        return reply.status(400).send({
          success: false,
          error: 'Category not found',
        });
      }

      if (category.categoryType !== kind) {
        return reply.status(400).send({
          success: false,
          error: 'Category type must match transaction kind',
        });
      }

      if (category.parentId) {
        const parentCategory = await dbMoney.getCategoryById(category.parentId, user.id);
        if (!parentCategory || parentCategory.categoryType !== kind) {
          return reply.status(400).send({
            success: false,
            error: 'Category parent must match transaction kind',
          });
        }
      }
    }

    const isGiftBoolean = isGift === true || isGift === 'true';

    const changedRows = await dbMoney.updateTransaction(
      id,
      dateISO,
      accountId,
      amount,
      categoryId || null,
      kind,
      isGiftBoolean,
      notes || null,
      null,
      user.id,
    );

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Transaction not found',
      });
    }

    reply.send({
      success: true,
      message: 'Transaction updated successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to update transaction',
      message: error.message,
    });
  }
}

function normalizeDetailsJSON(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeAccountIds(value) {
  let input = value;

  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(input)) {
    return [];
  }

  const normalized = input.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);

  return Array.from(new Set(normalized)).sort((first, second) => first - second);
}

function normalizeAssetFromDB(asset) {
  if (!asset) return null;

  const accountIds = normalizeAccountIds(asset.accountIdsJSON);

  return {
    id: asset.id,
    title: asset.title,
    ticker: asset.ticker,
    type: asset.type,
    accountIds,
  };
}

function isSameIdList(first, second) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (Number(first[index]) !== Number(second[index])) {
      return false;
    }
  }
  return true;
}

function assetHasAccountId(asset, accountId) {
  const accountIdNumber = Number(accountId);
  if (!Number.isInteger(accountIdNumber) || accountIdNumber <= 0) {
    return false;
  }

  return asset.accountIds.includes(accountIdNumber);
}

function toFiniteNumber(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) return null;
  return result;
}

function validateInvestPayload({ kind, amount, detailsJSON, assetType }) {
  const assetId = toFiniteNumber(detailsJSON.assetId);
  if (assetId == null || assetId <= 0) {
    return {
      success: false,
      error: 'detailsJSON.assetId must be a positive number',
    };
  }

  if (kind === TRANSACTION_KIND.INVEST_DIVIDEND) {
    const dividendAmount = toFiniteNumber(amount);
    if (dividendAmount == null || dividendAmount <= 0) {
      return {
        success: false,
        error: 'amount must be greater than 0',
      };
    }

    return {
      success: true,
      amount: dividendAmount,
      detailsJSON: {
        assetId,
      },
    };
  }

  const quantity = toFiniteNumber(detailsJSON.quantity);
  const price = toFiniteNumber(detailsJSON.price);
  const commissionAmount = toFiniteNumber(detailsJSON.commissionAmount) ?? 0;
  const accruedInterestAmount = toFiniteNumber(detailsJSON.accruedInterestAmount) ?? 0;

  if (quantity == null || quantity <= 0) {
    return {
      success: false,
      error: 'detailsJSON.quantity must be greater than 0',
    };
  }

  if (price == null || price <= 0) {
    return {
      success: false,
      error: 'detailsJSON.price must be greater than 0',
    };
  }

  if (commissionAmount < 0) {
    return {
      success: false,
      error: 'detailsJSON.commissionAmount must be greater than or equal to 0',
    };
  }

  if (accruedInterestAmount < 0) {
    return {
      success: false,
      error: 'detailsJSON.accruedInterestAmount must be greater than or equal to 0',
    };
  }

  if (assetType !== ASSET_TYPE.BOND && accruedInterestAmount !== 0) {
    return {
      success: false,
      error: 'detailsJSON.accruedInterestAmount is allowed only for bond assets',
    };
  }

  const amountValue =
    kind === TRANSACTION_KIND.INVEST_BUY
      ? quantity * price + commissionAmount + accruedInterestAmount
      : quantity * price - commissionAmount + accruedInterestAmount;

  return {
    success: true,
    amount: amountValue,
    detailsJSON: {
      assetId,
      quantity,
      price,
      commissionAmount,
      accruedInterestAmount,
    },
  };
}

export async function deleteTransaction(request, reply) {
  try {
    const { user } = request;
    const { id } = request.params;

    const changedRows = await dbMoney.deleteTransaction(id, user.id);

    if (changedRows === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Transaction not found',
      });
    }

    reply.send({
      success: true,
      message: 'Transaction deleted successfully',
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to delete transaction',
      message: error.message,
    });
  }
}
