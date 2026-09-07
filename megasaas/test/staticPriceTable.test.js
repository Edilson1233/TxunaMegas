import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StaticPriceTable } from '../src/core/pricing/StaticPriceTable.js';

test('StaticPriceTable resolve valor pago para megas a entregar', () => {
  const table = StaticPriceTable.fromEnv('15:600,30:1200');

  assert.equal(table.resolveDeliveryAmount(15), 600);
  assert.equal(table.resolveDeliveryAmount(30), 1200);
});

test('StaticPriceTable devolve null quando valor pago nao tem pacote', () => {
  const table = StaticPriceTable.fromEnv('15:600');

  assert.equal(table.resolveDeliveryAmount(20), null);
});

test('StaticPriceTable vazia nao cria adaptador', () => {
  assert.equal(StaticPriceTable.fromEnv(''), null);
});

test('StaticPriceTable rejeita entradas invalidas', () => {
  assert.throws(() => StaticPriceTable.fromEnv('15:abc'), /entrada invalida/);
});
