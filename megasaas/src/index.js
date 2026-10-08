import 'dotenv/config';
import pino from 'pino';
import { EventBus } from './core/events/EventBus.js';
import { BaileysProvider } from './whatsapp/provider/BaileysProvider.js';
import { WhatsAppEvents } from './whatsapp/events/WhatsAppEvents.js';
import { TenantContext } from './core/dto/TenantContext.js';
import { SessionManager } from './core/session/SessionManager.js';
import { InMemorySessionStore } from './core/session/InMemorySessionStore.js';
import { PendingTransactionManager } from './core/transactions/PendingTransactionManager.js';
import { createPendingTransactionStore } from './core/transactions/createPendingTransactionStore.js';
import { UssdCommandQueue } from './tasker/UssdCommandQueue.js';
import { createUssdCommandStore } from './tasker/createUssdCommandStore.js';
import { UssdEvents } from './tasker/UssdEvents.js';
import { parseTaskerDeviceTokens } from './tasker/taskerAuth.js';
import { createTaskerServer } from './tasker/server.js';
import { PurchaseFlowCoordinator } from './flow/PurchaseFlowCoordinator.js';
import { CorePaymentClient } from './core/api/CorePaymentClient.js';
import { StaticPriceTable } from './core/pricing/StaticPriceTable.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Frequência com que verificamos alegações pendentes há demasiado tempo sem
// confirmação. Nesta fase, um setInterval simples chega — a Fase 7
// substitui isto por um job atrasado no BullMQ (mais fiável).
const EXPIRY_CHECK_INTERVAL_MS = 5_000;
const DEFAULT_USSD_COMMAND_TIMEOUT_MS = 2 * 60 * 1000;

async function main() {
  const eventBus = new EventBus({ logger });

  const instanceId = process.env.WHATSAPP_INSTANCE_ID ?? 'default-instance';
  const tenantContext = TenantContext.resolveForInstance(instanceId, {
    tenantId: process.env.CORE_TENANT_ID ?? TenantContext.DEFAULT_TENANT_ID,
  });
  const corePaymentClient = process.env.CORE_API_BASE_URL
    ? new CorePaymentClient({
        baseUrl: process.env.CORE_API_BASE_URL,
        token: process.env.CORE_INTERNAL_API_TOKEN,
        logger,
      })
    : null;

  if (corePaymentClient) {
    logger.info({ baseUrl: process.env.CORE_API_BASE_URL }, '[main] pagamentos delegados ao Spring Core');
  }
  const priceTable = StaticPriceTable.fromEnv(process.env.PACKAGE_PRICE_TABLE);
  if (priceTable) {
    logger.info('[main] tabela temporaria de pacotes carregada de PACKAGE_PRICE_TABLE');
  }

  const sessionManager = new SessionManager({ store: new InMemorySessionStore() });
  const pendingTransactionStore = createPendingTransactionStore({ logger });
  const pendingTransactionManager = new PendingTransactionManager({
    store: pendingTransactionStore,
    eventBus,
    logger,
    corePaymentClient,
  });
  const ussdCommandStore = createUssdCommandStore({ logger });
  const ussdCommandQueue = new UssdCommandQueue({
    store: ussdCommandStore,
    eventBus,
    logger,
    dispatchTimeoutMs: Number(process.env.USSD_COMMAND_TIMEOUT_MS ?? DEFAULT_USSD_COMMAND_TIMEOUT_MS),
    maxAttempts: Number(process.env.USSD_COMMAND_MAX_ATTEMPTS ?? 1),
  });

  const provider = new BaileysProvider({
    eventBus,
    logger,
    instanceId,
    authDir: process.env.WHATSAPP_AUTH_DIR ?? './storage/auth',
  });

  const coordinator = new PurchaseFlowCoordinator({
    eventBus,
    sessionManager,
    pendingTransactionManager,
    ussdCommandQueue,
    tenantContext,
    logger,
    whatsAppProvider: provider,
    priceTable,
    corePaymentClient,
    taskerDeviceId: process.env.TASKER_DEVICE_ID ?? null,
  });
  coordinator.start();
  registerCoreUssdAuditHandlers({ eventBus, corePaymentClient, logger });

  const expiryInterval = setInterval(() => {
    pendingTransactionManager.checkExpired().catch((err) => logger.error({ err }, '[main] falha ao verificar expirações'));
  }, EXPIRY_CHECK_INTERVAL_MS);
  expiryInterval.unref();

  const ussdCommandTimeoutInterval = setInterval(() => {
    ussdCommandQueue.checkTimedOut().catch((err) => logger.error({ err }, '[main] falha ao verificar timeout de USSD'));
  }, EXPIRY_CHECK_INTERVAL_MS);
  ussdCommandTimeoutInterval.unref();

  // --- Servidor HTTP para o Tasker (Fase 5) ---
  const taskerApiKey = process.env.TASKER_API_KEY;
  const taskerDeviceId = process.env.TASKER_DEVICE_ID ?? null;
  const taskerDeviceTokens = parseTaskerDeviceTokens(process.env.TASKER_DEVICE_KEYS);
  if (!taskerApiKey) {
    logger.warn('[main] TASKER_API_KEY não definido — o servidor Tasker vai rejeitar TODOS os pedidos até isto ser configurado no .env');
  }
  if (taskerDeviceTokens.size > 0) {
    logger.info({ deviceCount: taskerDeviceTokens.size }, '[main] autenticação Tasker por token de dispositivo ativa');
  }
  const taskerServer = createTaskerServer({
    tenantContext,
    pendingTransactionManager,
    ussdCommandQueue,
    logger,
    apiKey: taskerApiKey,
    deviceId: taskerDeviceId,
    deviceTokens: taskerDeviceTokens,
  });
  const taskerPort = Number(process.env.TASKER_PORT ?? 3001);
  const httpServer = taskerServer.listen(taskerPort, () => {
    logger.info({ port: taskerPort }, '[main] servidor Tasker a escutar');
  });

  eventBus.on(WhatsAppEvents.MESSAGE_RECEIVED, (payload) => {
    logger.info({ contextKey: payload.contextKey, text: payload.text }, '[main] mensagem recebida');
    // A partir daqui, o PurchaseFlowCoordinator já trata da alegação (se
    // reconhecida como M-Pesa) — ver logs "[PurchaseFlowCoordinator] ...".
  });

  eventBus.on(WhatsAppEvents.CONNECTION_UPDATE, (payload) => {
    logger.info({ payload }, '[main] atualização de ligação');
  });

  await provider.connect();

  const shutdown = async () => {
    logger.info('[main] a encerrar...');
    clearInterval(expiryInterval);
    clearInterval(ussdCommandTimeoutInterval);
    httpServer.close();
    await pendingTransactionManager.close();
    await ussdCommandQueue.close();
    await provider.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, '[main] falha fatal ao iniciar');
  process.exit(1);
});

function registerCoreUssdAuditHandlers({ eventBus, corePaymentClient, logger }) {
  if (!corePaymentClient) return;

  eventBus.on(UssdEvents.COMPLETED, async ({ command, details }) => {
    await ackCoreUssdCommand({ corePaymentClient, logger, command, success: true, details });
  });

  eventBus.on(UssdEvents.FAILED, async ({ command, details }) => {
    await ackCoreUssdCommand({ corePaymentClient, logger, command, success: false, details });
  });
}

async function ackCoreUssdCommand({ corePaymentClient, logger, command, success, details }) {
  if (!command.coreCommandId) {
    logger.debug({ commandId: command.id }, '[main] comando USSD sem coreCommandId; ACK Core ignorado');
    return;
  }

  try {
    await corePaymentClient.ackUssdCommand({
      commandId: command.coreCommandId,
      success,
      details,
    });
  } catch (err) {
    logger.error({ err, commandId: command.id, coreCommandId: command.coreCommandId }, '[main] falha ao auditar ACK USSD no Core');
  }
}
