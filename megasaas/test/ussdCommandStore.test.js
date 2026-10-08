import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryUssdCommandStore } from '../src/tasker/InMemoryUssdCommandStore.js';

test('InMemoryUssdCommandStore guarda e lista comandos pela ordem de entrada', async () => {
  const store = new InMemoryUssdCommandStore();
  const first = { id: 'cmd-1', transactionId: 'TX1' };
  const second = { id: 'cmd-2', transactionId: 'TX2' };

  await store.save(first);
  await store.save(second);

  assert.equal(await store.get('cmd-1'), first);
  assert.deepEqual(await store.list(), [first, second]);
});

test('InMemoryUssdCommandStore remove comandos por id', async () => {
  const store = new InMemoryUssdCommandStore();
  await store.save({ id: 'cmd-1', transactionId: 'TX1' });

  assert.equal(await store.delete('cmd-1'), true);
  assert.equal(await store.get('cmd-1'), null);
  assert.deepEqual(await store.list(), []);
});
