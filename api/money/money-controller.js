import * as dbMoney from '../../db/db-money.js';
import { SYMBOL_POSITION, USED_FOR, isSymbolPositionValid, isUsedForValid } from './money-service.js';

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

    if (typeof whitespace !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: 'whitespace must be boolean',
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

    if (typeof whitespace !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: 'whitespace must be boolean',
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

    if (groupKey && typeof groupKey !== 'string') {
      return reply.status(400).send({
        success: false,
        error: 'groupKey must be a string',
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

    if (groupKey && typeof groupKey !== 'string') {
      return reply.status(400).send({
        success: false,
        error: 'groupKey must be a string',
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

    if (typeof oldGroupKey !== 'string' || typeof newGroupKey !== 'string') {
      return reply.status(400).send({
        success: false,
        error: 'oldGroupKey and newGroupKey must be strings',
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
