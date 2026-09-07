/**
 * MpesaMessageType (reexportação)
 * ---------------------------------
 * Desde a Fase 3, o enum canónico vive em `src/core/dto/TransactionType.js`
 * (partilhado por todos os parsers e DTOs). Este ficheiro só reexporta com
 * o nome antigo, para nada que já importa `MpesaMessageType` precisar de
 * mudar — nem os padrões em `patterns/`, nem os testes da Fase 2.
 */
export { TransactionType as MpesaMessageType } from '../core/dto/TransactionType.js';
