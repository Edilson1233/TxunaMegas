import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTaskerToken } from '../src/tasker/taskerAuth.js';
import { RateLimiter } from '../src/tasker/RateLimiter.js';

test('verifyTaskerToken aceita Bearer token correto', () => {
  assert.equal(verifyTaskerToken('Bearer segredo123', 'segredo123'), true);
});
test('verifyTaskerToken rejeita token errado', () => {
  assert.equal(verifyTaskerToken('Bearer errado', 'segredo123'), false);
});
test('verifyTaskerToken rejeita cabeçalho ausente', () => {
  assert.equal(verifyTaskerToken(undefined, 'segredo123'), false);
});
test('verifyTaskerToken nunca aceita se não houver token configurado no servidor', () => {
  assert.equal(verifyTaskerToken('Bearer qualquer', undefined), false);
});

test('RateLimiter permite pedidos dentro do limite', () => {
  const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
  assert.equal(limiter.allow('k1'), true);
  assert.equal(limiter.allow('k1'), true);
  assert.equal(limiter.allow('k1'), true);
});
test('RateLimiter bloqueia acima do limite', () => {
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });
  limiter.allow('k1');
  limiter.allow('k1');
  assert.equal(limiter.allow('k1'), false);
});
test('RateLimiter mantém chaves diferentes isoladas', () => {
  const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('b'), true);
});
