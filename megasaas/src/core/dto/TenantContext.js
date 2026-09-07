const DEFAULT_TENANT_ID = 'default-tenant';

/**
 * TenantContext
 * --------------
 * Identifica A QUEM pertence uma operação (qual revendedor). Hoje, antes da
 * Fase 8, existe sempre e apenas UM tenant — mas o conceito já existe desde
 * agora para que nenhuma camada futura (Transaction, PaymentVerification,
 * SessionManager) precise de ser reescrita quando a Fase 8 (Multi-tenancy)
 * passar a suportar vários revendedores reais.
 *
 * `resolveForInstance` é o ÚNICO ponto de entrada para descobrir o tenant a
 * partir de uma instância de WhatsApp. Na Fase 8, a implementação interna
 * passa a consultar uma tabela real (instanceId -> tenantId, guardada em
 * BD) em vez de devolver sempre o mesmo tenant — a assinatura do método
 * não muda, só o que acontece "por dentro".
 */
export class TenantContext {
  constructor({ tenantId, whatsappInstanceId, displayName = null }) {
    if (!tenantId) {
      throw new TypeError('[TenantContext] tenantId é obrigatório');
    }
    if (!whatsappInstanceId) {
      throw new TypeError('[TenantContext] whatsappInstanceId é obrigatório');
    }

    this.tenantId = tenantId;
    this.whatsappInstanceId = whatsappInstanceId;
    this.displayName = displayName;
  }

  static get DEFAULT_TENANT_ID() {
    return DEFAULT_TENANT_ID;
  }

  /**
   * @param {string} instanceId - o instanceId de uma instância WhatsAppProvider
   * @returns {TenantContext}
   */
  static resolveForInstance(instanceId, { tenantId = DEFAULT_TENANT_ID } = {}) {
    // Fase 8 troca esta linha por uma consulta real; hoje há sempre 1 tenant.
    return new TenantContext({ tenantId, whatsappInstanceId: instanceId });
  }
}
