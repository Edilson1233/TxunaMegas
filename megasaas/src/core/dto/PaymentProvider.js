/**
 * PaymentProvider
 * -----------------
 * Operadoras de dinheiro móvel suportadas. Só MPESA está implementado
 * (Fase 2); EMOLA já existe aqui como valor reservado para quando o parser
 * correspondente for construído — nenhum DTO que use este enum precisa de
 * mudar quando isso acontecer.
 */
export const PaymentProvider = Object.freeze({
  MPESA: 'MPESA',
  EMOLA: 'EMOLA',
});
