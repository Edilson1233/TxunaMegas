import { promises as fs } from 'node:fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import { WhatsAppProvider } from './WhatsAppProvider.js';
import { WhatsAppEvents } from '../events/WhatsAppEvents.js';
import { ContextKeyResolver } from '../../core/context/ContextKeyResolver.js';

/**
 * BaileysProvider
 * ----------------
 * Implementação concreta do WhatsAppProvider usando @whiskeysockets/baileys.
 *
 * DECISÃO ARQUITETURAL (porquê Baileys e não whatsapp-web.js):
 * - Baileys fala diretamente o protocolo Web do WhatsApp (WebSocket), sem
 *   precisar de Chromium/Puppeteer. Isto é decisivo para produção: cada
 *   instância whatsapp-web.js custa ~200-400MB de RAM (um Chrome inteiro);
 *   Baileys custa poucas dezenas de MB. Para um SaaS que pode vir a correr
 *   dezenas de instâncias (uma por tenant, ou um pool partilhado), isto é
 *   a diferença entre escalar em produção com custo razoável ou não escalar.
 *
 * RESPONSABILIDADE DESTA CLASSE (e só esta):
 * - Gerir a ligação (auth, reconexão, QR).
 * - Traduzir eventos nativos do Baileys para os eventos do nosso EventBus
 *   (contrato estável, ver WhatsAppEvents.js).
 * - NÃO faz parsing de M-Pesa, NÃO decide regras de negócio — isso é de
 *   outras fases/módulos, que apenas escutam o EventBus.
 */
export class BaileysProvider extends WhatsAppProvider {
  #socket = null;
  #status = 'DISCONNECTED';
  #eventBus;
  #logger;
  #baileysInternalLogger;
  #instanceId;
  #authDir;

  /**
   * @param {object} params
   * @param {import('../../core/events/EventBus.js').EventBus} params.eventBus
   * @param {object} params.logger - logger estilo pino (info/warn/error/debug)
   * @param {string} params.instanceId - identifica esta instância/número
   * @param {string} params.authDir - pasta onde a sessão fica persistida
   */
  constructor({ eventBus, logger, instanceId, authDir }) {
    super();
    this.#eventBus = eventBus;
    this.#logger = logger;
    this.#instanceId = instanceId;
    this.#authDir = authDir;
    // Logger dedicado, passado ao próprio Baileys. Nível 'warn' porque o
    // nível 'info' interno da lib é extremamente verboso (detalhes de sync
    // de histórico, media keys, etc.) — não é log de negócio, é log de
    // protocolo interno. O nosso logger de aplicação (this.#logger) continua
    // a registar tudo o que realmente importa (status, mensagens, erros).
    this.#baileysInternalLogger = logger.child({ class: 'baileys' }, { level: 'warn' });
  }

  async connect() {
    this.#setStatus('CONNECTING');

    const { state, saveCreds } = await useMultiFileAuthState(this.#authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.#socket = makeWASocket({
      version,
      auth: state,
      // IMPORTANTE: sem passar isto, o Baileys cria o seu próprio pino logger
      // a nível 'info', que despeja detalhes internos de sincronização
      // (hashes de ficheiro, chaves de media cifradas, etc.) — é ruído
      // interno normal, não é erro. Ao passar um logger a nível 'warn', só
      // vemos o que realmente importa.
      logger: this.#baileysInternalLogger,
      syncFullHistory: false,
      // Evita que o Baileys puxe o histórico de conversas antigas ao ligar —
      // só nos interessam mensagens novas ('notify'), e é essa sincronização
      // de histórico que gera a maior parte do ruído no terminal.
      shouldSyncHistoryMessage: () => false,
      printQRInTerminal: false,
    });

    this.#socket.ev.on('creds.update', saveCreds);
    this.#socket.ev.on('connection.update', (update) => this.#onConnectionUpdate(update));
    this.#socket.ev.on('messages.upsert', (upsert) => this.#onMessagesUpsert(upsert));

    return this;
  }

  async disconnect() {
    if (this.#socket) {
      await this.#socket.logout().catch((err) => {
        this.#logger.warn({ err }, '[BaileysProvider] erro ao fazer logout (ignorado)');
      });
    }
    this.#setStatus('DISCONNECTED');
  }

  async sendText(chatId, text, { quoted } = {}) {
    if (this.#status !== 'CONNECTED') {
      throw new Error('[BaileysProvider] não é possível enviar mensagem: socket não conectado');
    }
    const sendOptions = quoted ? { quoted } : undefined;
    await this.#socket.sendMessage(chatId, { text }, sendOptions);
  }

  getStatus() {
    return this.#status;
  }

  // ---- handlers internos ----

  #onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Útil em desenvolvimento local; em produção este evento deve ser
      // capturado por quem gere o onboarding do tenant (ex: exibir no painel).
      qrcodeTerminal.generate(qr, { small: true });
      this.#eventBus.emit(WhatsAppEvents.QR_GENERATED, {
        instanceId: this.#instanceId,
        qr,
      });
    }

    if (connection === 'open') {
      this.#setStatus('CONNECTED');
    }

    if (connection === 'close') {
      this.#setStatus('DISCONNECTED');
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      this.#eventBus.emit(WhatsAppEvents.CONNECTION_UPDATE, {
        instanceId: this.#instanceId,
        status: 'CLOSED',
        reason: statusCode ? String(statusCode) : 'unknown',
      });

      if (shouldReconnect) {
        this.#logger.warn(
          { instanceId: this.#instanceId, statusCode },
          '[BaileysProvider] ligação caiu, a tentar reconectar...'
        );
        this.connect().catch((err) =>
          this.#logger.error({ err }, '[BaileysProvider] falha ao reconectar')
        );
      } else {
        // Logout real (401): as credenciais guardadas em storage/auth ficam
        // inválidas. Se não as apagarmos, o Baileys vai tentar reusá-las na
        // próxima ligação e receber 401 de novo, SEM nunca gerar QR novo —
        // foi exatamente isto que aconteceu no reporte original deste bug.
        this.#logger.error(
          { instanceId: this.#instanceId },
          '[BaileysProvider] sessão terminada (logout). A limpar credenciais e a gerar novo QR code...'
        );
        this.#resetAuthAndReconnect();
      }
    }
  }

  /**
   * Apaga a pasta de credenciais (agora inválidas após um logout) e volta a
   * ligar, o que força o Baileys a criar um par de credenciais novo e a
   * emitir um QR code fresco — sem precisar de reiniciar o processo manualmente.
   */
  async #resetAuthAndReconnect() {
    try {
      await fs.rm(this.#authDir, { recursive: true, force: true });
    } catch (err) {
      this.#logger.error({ err }, '[BaileysProvider] falha ao limpar pasta de credenciais');
    }

    this.connect().catch((err) =>
      this.#logger.error({ err }, '[BaileysProvider] falha ao reconectar após logout')
    );
  }

  #onMessagesUpsert({ messages, type }) {
    // 'notify' = mensagens novas em tempo real (ignoramos histórico/sync).
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue; // mensagens de sistema/reações sem conteúdo relevante
      if (msg.key.fromMe) continue; // não processamos as nossas próprias mensagens

      const remoteJid = msg.key.remoteJid ?? '';
      const isGroup = remoteJid.endsWith('@g.us');

      const chatType = isGroup ? 'GROUP' : 'PRIVATE';
      const chatId = remoteJid;
      const userId = isGroup ? (msg.key.participant ?? '') : remoteJid;

      let contextKey;
      try {
        contextKey = ContextKeyResolver.resolve({ chatType, chatId, userId });
      } catch (err) {
        this.#logger.error({ err, msg: msg.key }, '[BaileysProvider] contextKey inválida, mensagem descartada');
        continue;
      }

      const text =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        null;

      this.#eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, {
        contextKey,
        chatType,
        chatId,
        userId,
        instanceId: this.#instanceId,
        messageId: msg.key.id,
        text,
        timestamp: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
        raw: msg,
      });
    }
  }

  #setStatus(status) {
    this.#status = status;
    this.#logger.info({ instanceId: this.#instanceId, status }, '[BaileysProvider] status alterado');
  }
}
