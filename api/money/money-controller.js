import * as dbMoney from '../../db/db-money.js';
import { SYMBOL_POSITION, isSymbolPositionValid } from './money-service.js';

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
