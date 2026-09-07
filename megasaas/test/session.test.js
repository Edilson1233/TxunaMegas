import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/core/session/Session.js';
import { SessionState } from '../src/core/session/SessionState.js';
import { SessionManager } from '../src/core/session/SessionManager.js';
import { InMemorySessionStore } from '../src/core/session/InMemorySessionStore.js';

test('Session nasce em IDLE por defeito', () => {
  const session = new Session({ contextKey: 'chat1' });
  assert.equal(session.state, SessionState.IDLE);
});

test('Session permite transições válidas na ordem certa', () => {
  const session = new Session({ contextKey: 'chat1' });
  session.transitionTo(SessionState.AWAITING_VERIFICATION, { currentTransactionId: 'TX1' });
  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);
  assert.equal(session.currentTransactionId, 'TX1');

  session.transitionTo(SessionState.PROCESSING);
  assert.equal(session.state, SessionState.PROCESSING);

  session.transitionTo(SessionState.COMPLETED);
  assert.equal(session.state, SessionState.COMPLETED);

  session.transitionTo(SessionState.IDLE);
  assert.equal(session.state, SessionState.IDLE);
});

test('Session rejeita transição inválida (saltar estados)', () => {
  const session = new Session({ contextKey: 'chat1' });
  assert.throws(() => session.transitionTo(SessionState.COMPLETED), /transição inválida/);
});

test('Session permite nova alegação chegar enquanto outra ainda está pendente (correção pós-Fase 4)', () => {
  const session = new Session({ contextKey: 'chat1' });
  session.transitionTo(SessionState.AWAITING_VERIFICATION, { currentTransactionId: 'TX1' });

  // Não deve lançar — cenário real: cliente manda uma segunda SMS antes da primeira ser resolvida.
  session.transitionTo(SessionState.AWAITING_VERIFICATION, { currentTransactionId: 'TX2' });

  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);
  assert.equal(session.currentTransactionId, 'TX2');
});

test('Session permite começar nova compra logo a seguir a uma concluída', () => {
  const session = new Session({ contextKey: 'chat1' });
  session.transitionTo(SessionState.AWAITING_VERIFICATION);
  session.transitionTo(SessionState.PROCESSING);
  session.transitionTo(SessionState.COMPLETED);

  // Não deve lançar — não é obrigatório passar por IDLE entre duas compras.
  session.transitionTo(SessionState.AWAITING_VERIFICATION, { currentTransactionId: 'TX_NOVA' });
  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);
});

test('Session permite duas rejeições seguidas sem lançar erro', () => {
  const session = new Session({ contextKey: 'chat1' });
  session.transitionTo(SessionState.AWAITING_VERIFICATION);
  session.transitionTo(SessionState.NOT_FOUND);

  // Não deve lançar — cenário real: cliente manda duas SMS inválidas seguidas.
  session.transitionTo(SessionState.NOT_FOUND);
  assert.equal(session.state, SessionState.NOT_FOUND);
});

test('Session permite pedir número de destino e depois avançar para verificação', () => {
  const session = new Session({ contextKey: 'chat1' });
  session.transitionTo(SessionState.AWAITING_DESTINATION_NUMBER);
  assert.equal(session.state, SessionState.AWAITING_DESTINATION_NUMBER);

  // Auto-loop: cliente responde com número inválido, bot pede outra vez.
  session.transitionTo(SessionState.AWAITING_DESTINATION_NUMBER);

  session.transitionTo(SessionState.AWAITING_VERIFICATION);
  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);
});

test('SessionManager cria sessão em IDLE na primeira vez e reutiliza depois', async () => {
  const manager = new SessionManager({ store: new InMemorySessionStore() });

  const first = await manager.getOrCreate('chat1');
  assert.equal(first.state, SessionState.IDLE);

  await manager.transition('chat1', SessionState.AWAITING_VERIFICATION);
  const second = await manager.getOrCreate('chat1');
  assert.equal(second.state, SessionState.AWAITING_VERIFICATION);
});

test('SessionManager mantém sessões de contextKeys diferentes isoladas', async () => {
  const manager = new SessionManager({ store: new InMemorySessionStore() });

  await manager.transition('chatA', SessionState.AWAITING_VERIFICATION);

  const chatB = await manager.getOrCreate('chatB');
  assert.equal(chatB.state, SessionState.IDLE);
});
