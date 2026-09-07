import express from 'express';
import { verifyTaskerToken } from './taskerAuth.js';
import { RateLimiter } from './RateLimiter.js';
import { handleSmsReport, handleNextCommand, handleCommandAck } from './taskerHandlers.js';

/**
 * createTaskerServer
 * --------------------
 * Servidor HTTP dedicado ao Tasker — propositadamente separado da lógica
 * de negócio (ver taskerHandlers.js: funções puras, testáveis sem Express).
 * Esta camada só trata de transporte: parsing HTTP, autenticação, rate
 * limiting, e mapear o resultado das funções puras para respostas HTTP.
 */
export function createTaskerServer({
  tenantContext,
  pendingTransactionManager,
  ussdCommandQueue,
  logger,
  apiKey,
  deviceId = null,
}) {
  const app = express();
  app.use(express.json());

  const rateLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });

  app.use((req, res, next) => {
    if (!verifyTaskerToken(req.headers.authorization, apiKey)) {
      return res.status(401).json({ status: 'REJECTED', reason: 'INVALID_AUTH' });
    }
    if (!rateLimiter.allow(req.headers.authorization)) {
      return res.status(429).json({ status: 'REJECTED', reason: 'RATE_LIMITED' });
    }
    next();
  });

  app.post('/api/v1/tasker/sms', async (req, res) => {
    const { httpStatus, body } = await handleSmsReport({
      body: req.body,
      tenantContext,
      pendingTransactionManager,
      ussdCommandQueue,
      deviceId,
    });
    logger.info({ httpStatus, transactionId: req.body?.transactionId }, '[TaskerServer] POST /sms');
    res.status(httpStatus).json(body);
  });

  app.get('/api/v1/tasker/commands/next', (req, res) => {
    const { httpStatus, body } = handleNextCommand({ ussdCommandQueue });
    if (httpStatus === 204) return res.status(204).end();
    res.status(httpStatus).json(body);
  });

  const handleAckRequest = (req, res) => {
    const { httpStatus, body } = handleCommandAck({
      commandId: req.params.commandId,
      body: req.body,
      query: req.query,
      ussdCommandQueue,
    });
    logger.info(
      {
        commandId: req.params.commandId,
        success: req.body?.success ?? req.query?.success,
        httpStatus,
        method: req.method,
      },
      '[TaskerServer] /commands/:id/ack'
    );
    res.status(httpStatus).json(body);
  };

  app.post('/api/v1/tasker/commands/:commandId/ack', handleAckRequest);
  app.get('/api/v1/tasker/commands/:commandId/ack', handleAckRequest);

  return app;
}
