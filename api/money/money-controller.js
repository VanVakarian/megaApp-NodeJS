import * as dbMoney from '../../db/db-money.js';
import {
  ACCOUNT_KIND,
  CATEGORY_TYPE,
  isAccountKindValid,
  isCategoryTypeValid,
  isSymbolPositionValid,
  isTransactionKindValid,
  SYMBOL_POSITION,
  TRANSACTION_KIND,
} from './money-service.js';

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                 ~~~ CURRENCIES ~~~                                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                 ~~~ CATEGORIES ~~~                                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                  ~~~ ACCOUNTS ~~~                                                 ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

    const isInvestBoolean = isInvest === true || isInvest === 'true';
    const accountId = await dbMoney.createAccount(title, currencyId, isInvestBoolean, kind, user.id);

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

    const isInvestBoolean = isInvest === true || isInvest === 'true';
    const changedRows = await dbMoney.updateAccount(id, title, currencyId, isInvestBoolean, kind, user.id);

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

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~                                                ~~~ TRANSACTIONS ~~~                                               ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

export async function createTransaction(request, reply) {
  try {
    const { user } = request;
    const { dateISO, accountId, amount, categoryId, kind, isGift, notes } = request.body;

    const missingFields = [];

    if (!dateISO) missingFields.push('dateISO');
    if (!accountId) missingFields.push('accountId');
    if (!amount) missingFields.push('amount');
    if (!kind) missingFields.push('kind');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isTransactionKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be either "${TRANSACTION_KIND.INCOME}" or "${TRANSACTION_KIND.EXPENSE}"`,
      });
    }

    if (amount <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'amount must be greater than 0',
      });
    }

    const isAccountExist = await dbMoney.getAccountById(accountId, user.id);
    if (!isAccountExist) {
      return reply.status(400).send({
        success: false,
        error: 'Account not found',
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
    const { dateISO, accountId, amount, categoryId, kind, isGift, notes } = request.body;

    const missingFields = [];

    if (!dateISO) missingFields.push('dateISO');
    if (!accountId) missingFields.push('accountId');
    if (!amount) missingFields.push('amount');
    if (!kind) missingFields.push('kind');

    if (missingFields.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (!isTransactionKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be either "${TRANSACTION_KIND.INCOME}" or "${TRANSACTION_KIND.EXPENSE}"`,
      });
    }

    if (amount <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'amount must be greater than 0',
      });
    }

    const isTransactionExist = await dbMoney.getTransactionById(id, user.id);
    if (!isTransactionExist) {
      return reply.status(404).send({
        success: false,
        error: 'Transaction not found',
      });
    }

    const isAccountExist = await dbMoney.getAccountById(accountId, user.id);
    if (!isAccountExist) {
      return reply.status(400).send({
        success: false,
        error: 'Account not found',
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
