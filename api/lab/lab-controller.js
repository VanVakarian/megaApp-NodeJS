import * as labService from './lab-service.js';

export async function generateProduct(request, reply) {
  const { description, id, nextN, useKcals, isToBeSaved } = request.query;

  if (!description && !id && !nextN) {
    return reply.code(400).send({
      result: false,
      error: 'Either description, id, or nextN query parameter must be provided',
    });
  }

  const catalogueId = id ? parseInt(id) : null;
  const batchSize = nextN ? parseInt(nextN) : null;
  const isUsingKcals = useKcals === 'true' || useKcals === true;
  const isSavingToDb = isToBeSaved === 'true' || isToBeSaved === true;

  if (isSavingToDb && !catalogueId && !batchSize) {
    return reply.code(400).send({
      result: false,
      error: 'isToBeSaved parameter only works with id or nextN parameters',
    });
  }

  try {
    if (description) {
      const result = await labService.generateProductFromInput(description.trim(), null, isUsingKcals, false);

      if (result.success) {
        return reply.code(200).send({
          result: true,
          data: result.data,
          metadata: result.metadata,
          saved: result.saved,
          previousData: result.previousData,
          generatedFrom: result.generatedFrom,
        });
      }

      return reply.code(400).send({
        result: false,
        error: result.error,
        data: result.data,
      });
    } else if (catalogueId) {
      const result = await labService.generateProductFromInput(null, catalogueId, isUsingKcals, isSavingToDb);

      if (result.success) {
        return reply.code(200).send({
          result: true,
          data: result.data,
          metadata: result.metadata,
          saved: result.saved,
          previousData: result.previousData,
          generatedFrom: result.generatedFrom,
        });
      }

      return reply.code(400).send({
        result: false,
        error: result.error,
        data: result.data,
      });
    } else if (batchSize) {
      const result = await labService.generateBatch(batchSize, isUsingKcals, isSavingToDb);

      if (result.success) {
        return reply.code(200).send({
          result: true,
          data: result.data,
          batchInfo: result.batchInfo,
          metadata: result.metadata,
        });
      }

      return reply.code(400).send({
        result: false,
        error: result.error,
        data: result.data,
        batchInfo: result.batchInfo,
      });
    }
  } catch (error) {
    console.error('Error in generateProduct:', error);
    return reply.code(500).send({
      result: false,
      error: 'Internal server error',
    });
  }
}
