import 'dotenv/config';
import pino from 'pino';
import { EventBus } from './core/events/EventBus.js';
import { BaileysProvider } from './whatsapp/provider/BaileysProvider.js';
import { WhatsAppEvents } from './whatsapp/events/WhatsAppEvents.js';
import { TenantContext } from './core/dto/TenantContext.js';
import { SessionManager } from './core/session/SessionManager.js';
import { InMemorySessionStore } from './core/session/InMemorySessionStore.js';
import { PendingTransactionManager } from './core/transactions/PendingTransactionManager.js';
import { InMemoryPendingTransactionStore } from './core/transactions/InMemoryPendingTransactionStore.js';
import { UssdCommandQueue } from './tasker/UssdCommandQueue.js';
import { createTaskerServer } from './tasker/server.js';
import { PurchaseFlowCoordinator } from './flow/PurchaseFlowCoordinator.js';
import { CorePaymentClient } from './core/api/CorePaymentClient.js';
import { StaticPriceTable } from './core/pricing/StaticPriceTable.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Frequência com que verificamos alegações pendentes há demasiado tempo sem
// confirmação. Nesta fase, um setInterval simples chega — a Fase 7
// substitui isto por um job atrasado no BullMQ (mais fiável).
const EXPIRY_CHECK_INTERVAL_MS = 5_000;

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
  const pendingTransactionManager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger,
    corePaymentClient,
  });
  const ussdCommandQueue = new UssdCommandQueue({ eventBus, logger });

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
  });
  coordinator.start();

  const expiryInterval = setInterval(() => {
    pendingTransactionManager.checkExpired().catch((err) => logger.error({ err }, '[main] falha ao verificar expirações'));
  }, EXPIRY_CHECK_INTERVAL_MS);
  expiryInterval.unref();

  // --- Servidor HTTP para o Tasker (Fase 5) ---
  const taskerApiKey = process.env.TASKER_API_KEY;
  if (!taskerApiKey) {
    logger.warn('[main] TASKER_API_KEY não definido — o servidor Tasker vai rejeitar TODOS os pedidos até isto ser configurado no .env');
  }
  const taskerServer = createTaskerServer({
    tenantContext,
    pendingTransactionManager,
    ussdCommandQueue,
    logger,
    apiKey: taskerApiKey,
    deviceId: process.env.TASKER_DEVICE_ID,
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
    httpServer.close();
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
