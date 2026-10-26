import test from "node:test";
import assert from "node:assert/strict";
import { GAMES, getGameById, validateRegistry } from "../src/registry.js";
import { emptyRoomState, isValidRequest, normalizeRoomState, STATE_KEY } from "../src/constants.js";
import { isAllowedCommand } from "../src/permissions.js";

 test("o registro contém minigames únicos e implementados", () => {
  assert.equal(validateRegistry(), true);
  assert.equal(new Set(GAMES.map((game) => game.id)).size, GAMES.length);
});

test("o minigame de demonstração inicia em estado desligado", () => {
  const game = getGameById("demo-switch");
  assert.ok(game);
  assert.deepEqual(game.createInitialState(), { on: false, activations: 0 });
});

test("ações de alternância são reduzidas em sequência sem perder acionamentos", () => {
  const game = getGameById("demo-switch");
  let state = game.createInitialState();
  state = game.reduce(state, { type: "toggle-switch" });
  assert.deepEqual(state, { on: true, activations: 1 });
  state = game.reduce(state, { type: "toggle-switch" });
  assert.deepEqual(state, { on: false, activations: 2 });
  state = game.reduce(state, { type: "toggle-switch" });
  assert.deepEqual(state, { on: true, activations: 3 });
});

test("ações desconhecidas não alteram o estado do jogo", () => {
  const game = getGameById("demo-switch");
  const state = { on: true, activations: 4 };
  assert.equal(game.reduce(state, { type: "not-registered" }), state);
});

test("estado ausente ou malformado vira um estado vazio seguro", () => {
  assert.deepEqual(normalizeRoomState({}), emptyRoomState());
  assert.deepEqual(normalizeRoomState({ [STATE_KEY]: { version: 999 } }), emptyRoomState());
  assert.deepEqual(normalizeRoomState({ [STATE_KEY]: { version: 1, activeGameId: "demo-switch", sessionId: null } }), emptyRoomState());
});

test("comandos administrativos e ações exigem estrutura válida", () => {
  assert.equal(isValidRequest({ requestId: "abc-123", type: "start", gameId: "demo-switch" }), true);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "close", sessionId: "session-123" }), true);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "action", gameId: "demo-switch", sessionId: "session-123", action: { type: "toggle-switch" } }), true);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "start", gameId: "" }), false);
  assert.equal(isValidRequest({ requestId: "x", type: "close", sessionId: "session-123" }), false);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "action", gameId: "demo-switch", sessionId: "session-123", action: "toggle" }), false);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "delete-all" }), false);
});


test("permissões: só GM administra; jogadores podem enviar ações do jogo", () => {
  assert.equal(isAllowedCommand("GM", "start"), true);
  assert.equal(isAllowedCommand("GM", "close"), true);
  assert.equal(isAllowedCommand("PLAYER", "start"), false);
  assert.equal(isAllowedCommand("PLAYER", "close"), false);
  assert.equal(isAllowedCommand("PLAYER", "action"), true);
  assert.equal(isAllowedCommand("GM", "action"), true);
  assert.equal(isAllowedCommand(null, "action"), false);
  assert.equal(isAllowedCommand("PLAYER", "unknown"), false);
});
