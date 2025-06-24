import * as dbMoney from '../../db/db-money.js';
import {
  ACCOUNT_KIND,
  isAccountKindValid,
  isSymbolPositionValid,
  isTransactionKindValid,
  isUsedForValid,
  SYMBOL_POSITION,
  TRANSACTION_KIND,
  USED_FOR,
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

    if (!title || !ticker || !symbol) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: title, ticker, symbol',
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

    if (!title || !ticker || !symbol) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: title, ticker, symbol',
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
    const { name, usedFor, groupKey } = request.body;

    if (!name || !usedFor) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: name, usedFor',
      });
    }

    if (!isUsedForValid(usedFor)) {
      return reply.status(400).send({
        success: false,
        error: `usedFor must be one of: ${Object.values(USED_FOR).join(', ')}`,
      });
    }

    const categoryId = await dbMoney.createCategory(name, usedFor, groupKey || null, user.id);

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
    const { name, usedFor, groupKey } = request.body;

    if (!name || !usedFor) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: name, usedFor',
      });
    }

    if (!isUsedForValid(usedFor)) {
      return reply.status(400).send({
        success: false,
        error: `usedFor must be one of: ${Object.values(USED_FOR).join(', ')}`,
      });
    }

    const isCategoryExist = await dbMoney.getCategoryById(id, user.id);
    if (!isCategoryExist) {
      return reply.status(404).send({
        success: false,
        error: 'Category not found',
      });
    }

    const changedRows = await dbMoney.updateCategory(id, name, usedFor, groupKey || null, user.id);

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

export async function updateGroupKey(request, reply) {
  try {
    const { user } = request;
    const { oldGroupKey, newGroupKey } = request.body;

    if (!oldGroupKey || !newGroupKey) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: oldGroupKey, newGroupKey',
      });
    }

    const changedRows = await dbMoney.updateGroupKey(oldGroupKey, newGroupKey, user.id);

    reply.send({
      success: true,
      message: `Group key updated successfully. ${changedRows} categories affected.`,
      data: { affectedRows: changedRows },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      error: 'Failed to update group key',
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
    const { title, currencyId, isInvest, kind, categoryIds } = request.body;

    if (!title || !currencyId || !kind) {
      return reply.status(400).send({
        success: false,
        error: 'Missing some of required fields: title, currencyId, kind',
      });
    }

    if (!isAccountKindValid(kind)) {
      return reply.status(400).send({
        success: false,
        error: `kind must be one of: ${Object.values(ACCOUNT_KIND).join(', ')}`,
      });
    }

    const isInvestBoolean = isInvest === true || isInvest === 'true';
    const categoryIdsJson = categoryIds ? JSON.stringify(categoryIds) : null;

    const accountId = await dbMoney.createAccount(title, currencyId, isInvestBoolean, kind, categoryIdsJson, user.id);

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
    const { title, currencyId, isInvest, kind, categoryIds } = request.body;

    if (!title || !currencyId || !kind) {
      return reply.status(400).send({
        success: false,
        error: 'Missing some of required fields: title, currencyId, kind',
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
    const categoryIdsJson = categoryIds ? JSON.stringify(categoryIds) : null;

    const changedRows = await dbMoney.updateAccount(
      id,
      title,
      currencyId,
      isInvestBoolean,
      kind,
      categoryIdsJson,
      user.id
    );

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
    const { dateISO, accountId, amount, categoryIds, kind, isGift, notes } = request.body;

    if (!dateISO || !accountId || !amount || !kind) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: dateISO, accountId, amount, kind',
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

    const isGiftBoolean = isGift === true || isGift === 'true';
    const categoryIdsJson = categoryIds ? JSON.stringify(categoryIds) : null;

    const finalAmountWithCorrectSign = kind === TRANSACTION_KIND.EXPENSE ? -Math.abs(amount) : Math.abs(amount);

    const transactionId = await dbMoney.createTransaction(
      dateISO,
      accountId,
      finalAmountWithCorrectSign,
      categoryIdsJson,
      kind,
      isGiftBoolean,
      notes || null,
      user.id
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
    const { dateISO, accountId, amount, categoryIds, kind, isGift, notes } = request.body;

    if (!dateISO || !accountId || !amount || !kind) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: dateISO, accountId, amount, kind',
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

    const isGiftBoolean = isGift === true || isGift === 'true';
    const categoryIdsJson = categoryIds ? JSON.stringify(categoryIds) : null;

    const finalAmountWithCorrectSign = kind === TRANSACTION_KIND.EXPENSE ? -Math.abs(amount) : Math.abs(amount);

    const changedRows = await dbMoney.updateTransaction(
      id,
      dateISO,
      accountId,
      finalAmountWithCorrectSign,
      categoryIdsJson,
      kind,
      isGiftBoolean,
      notes || null,
      user.id
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
