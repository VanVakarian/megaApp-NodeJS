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

export async function generateEmbeddings(request, reply) {
  const { count } = request.query;

  if (!count) {
    return reply.code(400).send({
      result: false,
      error: 'count query parameter is required',
    });
  }

  const entriesCount = parseInt(count);

  if (isNaN(entriesCount) || entriesCount < 1 || entriesCount > 100) {
    return reply.code(400).send({
      result: false,
      error: 'count must be a number between 1 and 100',
    });
  }

  try {
    const result = await labService.generateEmbeddings(entriesCount);

    if (result.success) {
      return reply.code(200).send({
        result: true,
        data: result.data,
        batchInfo: result.batchInfo,
      });
    }

    return reply.code(400).send({
      result: false,
      error: result.error,
      data: result.data,
      batchInfo: result.batchInfo,
    });
  } catch (error) {
    console.error('Error in generateEmbeddings:', error);
    return reply.code(500).send({
      result: false,
      error: 'Internal server error',
    });
  }
}

export async function generateImage(request, reply) {
  const { id, nextN } = request.query;

  if (!id && !nextN) {
    return reply.code(400).send({
      result: false,
      error: 'Either id or nextN query parameter must be provided',
    });
  }

  const catalogueId = id ? parseInt(id) : null;
  const batchSize = nextN ? parseInt(nextN) : null;

  try {
    if (catalogueId) {
      const result = await labService.generateImageFromId(catalogueId);

      if (result.success) {
        return reply.code(200).send({
          result: true,
          data: result.data,
          metadata: result.metadata,
        });
      }

      return reply.code(400).send({
        result: false,
        error: result.error,
      });
    } else if (batchSize) {
      const result = await labService.generateImageBatch(batchSize);

      if (result.success) {
        return reply.code(200).send({
          result: true,
          data: result.data,
          batchInfo: result.batchInfo,
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
    console.error('Error in generateImage:', error);
    return reply.code(500).send({
      result: false,
      error: 'Internal server error',
    });
  }
}
