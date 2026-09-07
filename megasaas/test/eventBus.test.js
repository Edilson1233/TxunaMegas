import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events/EventBus.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

test('handler síncrono que lança erro não impede outros handlers de correr', () => {
  const eventBus = new EventBus({ logger: silentLogger });
  let secondHandlerRan = false;

  eventBus.on('evento.teste', () => {
    throw new Error('falha proposital');
  });
  eventBus.on('evento.teste', () => {
    secondHandlerRan = true;
  });

  assert.doesNotThrow(() => eventBus.emit('evento.teste', {}));
  assert.equal(secondHandlerRan, true);
});

test('handler assíncrono que rejeita não gera unhandled rejection nem impede outros handlers', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  let secondHandlerRan = false;

  eventBus.on('evento.teste', async () => {
    throw new Error('falha proposital assíncrona');
  });
  eventBus.on('evento.teste', () => {
    secondHandlerRan = true;
  });

  eventBus.emit('evento.teste', {});
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(secondHandlerRan, true);
});

test('caso real: segunda transição inválida de Session dentro de um handler não derruba o EventBus', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  let laterHandlerRan = false;

  eventBus.on('evento.teste', async () => {
    // Simula exatamente o bug original: uma transição de estado inválida
    // lançada dentro de um handler assíncrono.
    const { Session } = await import('../src/core/session/Session.js');
    const { SessionState } = await import('../src/core/session/SessionState.js');
    const session = new Session({ contextKey: 'chat1' });
    session.transitionTo(SessionState.COMPLETED); // inválido a partir de IDLE
  });
  eventBus.on('evento.teste', () => {
    laterHandlerRan = true;
  });

  eventBus.emit('evento.teste', {});
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(laterHandlerRan, true);
});
