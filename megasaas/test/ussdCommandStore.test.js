import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryUssdCommandStore } from '../src/tasker/InMemoryUssdCommandStore.js';

test('InMemoryUssdCommandStore guarda e lista comandos pela ordem de entrada', () => {
  const store = new InMemoryUssdCommandStore();
  const first = { id: 'cmd-1', transactionId: 'TX1' };
  const second = { id: 'cmd-2', transactionId: 'TX2' };

  store.save(first);
  store.save(second);

  assert.equal(store.get('cmd-1'), first);
  assert.deepEqual(store.list(), [first, second]);
});

test('InMemoryUssdCommandStore remove comandos por id', () => {
  const store = new InMemoryUssdCommandStore();
  store.save({ id: 'cmd-1', transactionId: 'TX1' });

  assert.equal(store.delete('cmd-1'), true);
  assert.equal(store.get('cmd-1'), null);
  assert.deepEqual(store.list(), []);
});
