import { execSync } from 'child_process';
import * as aiService from '../ai/ai-service.js';
import * as debugService from './debug-service.js';

export async function ping(request, reply) {
  const message = await debugService.ping();
  return reply.send({ message: message });
}

export async function latestCommitInfo(request, reply) {
  let commitHash = 'unknown';
  let commitDateTime = 'unknown';

  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const rawDate = execSync('git show -s --format=%ci HEAD').toString().trim();

    const date = new Date(rawDate);
    commitDateTime = date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.error('Failed to get git info:', error);
  }

  return { commitHash, commitDateTime };
}

export async function testLlm(request, reply) {
  try {
    if (!aiService.isAiEnabled()) {
      return reply.code(503).send({
        result: false,
        error: 'LLM service is disabled',
      });
    }

    const testDescription = request.query.description || 'домашний творог с медом';

    const result = await aiService.generateGeneralizedProduct(testDescription);

    if (result.success) {
      return reply.send({
        result: true,
        input: testDescription,
        data: result.data,
        metadata: result.metadata,
      });
    } else {
      return reply.code(500).send({
        result: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Debug LLM test error:', error);
    return reply.code(500).send({
      result: false,
      error: 'Internal server error',
    });
  }
}

export async function testLlmMultiModel(request, reply) {
  try {
    if (!aiService.isAiEnabled()) {
      return reply.code(503).send({
        result: false,
        error: 'LLM service is disabled',
      });
    }

    const testDescription = request.query.description || 'яблоко зеленое кислое';

    const multiResult = await aiService.testMultipleModels(testDescription);

    return reply.send({
      result: true,
      input: testDescription,
      data: multiResult,
    });
  } catch (error) {
    console.error('Debug LLM multi-model test error:', error);
    return reply.code(500).send({
      result: false,
      error: error.message,
    });
  }
}
