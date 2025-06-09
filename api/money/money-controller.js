import * as dbMoney from '../../db/db-money.js';
import {
  ACCOUNT_KIND,
  isAccountKindValid,
  isSymbolPositionValid,
  isUsedForValid,
  SYMBOL_POSITION,
  USED_FOR,
} from './money-service.js';

// ====================================================================================================== CURRENCIES ===

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

    const existingCurrency = await dbMoney.getCurrencyById(id, user.id);
    if (!existingCurrency) {
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

// ====================================================================================================== CATEGORIES ===

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

    const existingCategory = await dbMoney.getCategoryById(id, user.id);
    if (!existingCategory) {
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

// ======================================================================================================== ACCOUNTS ===

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
    const { title, currencyId, invest, kind, categoryIds } = request.body;

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

    const investBoolean = invest === true || invest === 'true';
    const categoryIdsJson = categoryIds ? JSON.stringify(categoryIds) : null;

    const accountId = await dbMoney.createAccount(title, currencyId, investBoolean, kind, categoryIdsJson, user.id);

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
    const { title, currencyId, invest, kind, categoryIds } = request.body;

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

    const existingAccount = await dbMoney.getAccountById(id, user.id);
    if (!existingAccount) {
      return reply.status(404).send({
        success: false,
        error: 'Account not found',
      });
    }

    const investBoolean = invest === true || invest === 'true';
    const categoryIdsJson = categoryIds ? JSON.stringify(categoryIds) : null;

    const changedRows = await dbMoney.updateAccount(
      id,
      title,
      currencyId,
      investBoolean,
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
