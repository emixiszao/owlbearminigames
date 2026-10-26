import test from "node:test";
import assert from "node:assert/strict";
import { GAMES, getGameById, validateRegistry } from "../src/registry.js";
import { calculateReadings, countSolutions, generateDistributionState, isInTarget } from "../src/games/distribution.js";
import { emptyRoomState, isValidRequest, normalizeRoomState, STATE_KEY } from "../src/constants.js";
import { isAllowedCommand } from "../src/permissions.js";

function maskToSwitches(mask) {
  return Array.from({ length: 4 }, (_, index) => Boolean(mask & (1 << index)));
}

test("o registro contém minigames únicos e implementados", () => {
  assert.equal(validateRegistry(), true);
  assert.equal(new Set(GAMES.map((game) => game.id)).size, GAMES.length);
  assert.equal(GAMES.length, 1);
  assert.equal(GAMES[0].id, "distribution");
});

test("cada geração cria um painel com dois medidores e quatro interruptores", () => {
  const game = getGameById("distribution");
  assert.ok(game);
  const state = game.createInitialState();
  assert.equal(state.switches.length, 4);
  assert.equal(state.effects.length, 4);
  assert.ok(Number.isFinite(state.readings.a));
  assert.ok(Number.isFinite(state.readings.b));
  assert.equal(state.solved, false);
});

test("100 configurações geradas são válidas, solucionáveis e têm uma única solução", () => {
  for (let index = 0; index < 100; index += 1) {
    const state = generateDistributionState();
    assert.equal(state.switches.length, 4);
    assert.ok(state.readings.a >= 0 && state.readings.a <= 100);
    assert.ok(state.readings.b >= 0 && state.readings.b <= 100);
    assert.ok(state.targets.a.min >= 0 && state.targets.a.max <= 100);
    assert.ok(state.targets.b.min >= 0 && state.targets.b.max <= 100);
    assert.equal(countSolutions(state.effects, state.base, state.targets), 1);
    let reachable = false;
    for (let mask = 0; mask < 16; mask += 1) {
      const readings = calculateReadings(state.base, state.effects, maskToSwitches(mask));
      if (isInTarget(readings, state.targets)) reachable = true;
    }
    assert.equal(reachable, true);
    assert.equal(isInTarget(state.readings, state.targets), false);
    assert.equal("solutionMask" in state, false);
  }
});

test("cada interruptor altera a leitura e desligá-lo desfaz exatamente o efeito", () => {
  const game = getGameById("distribution");
  const initial = game.createInitialState();
  const index = initial.switches.findIndex((value) => value === false);
  assert.notEqual(index, -1);
  const toggled = game.reduce(initial, { type: "toggle-switch", index });
  assert.notDeepEqual(toggled.readings, initial.readings);
  assert.equal(toggled.switches[index], true);
  const restored = game.reduce(toggled, { type: "toggle-switch", index });
  assert.deepEqual(restored.switches, initial.switches);
  assert.deepEqual(restored.readings, initial.readings);
});

test("vitória só ocorre quando os dois medidores estão simultaneamente na faixa", () => {
  const game = getGameById("distribution");
  const state = game.createInitialState();
  const onlyA = { ...state.readings, a: state.targets.a.center };
  assert.equal(onlyA.a >= state.targets.a.min && onlyA.a <= state.targets.a.max, true);
  assert.equal(onlyA.b >= state.targets.b.min && onlyA.b <= state.targets.b.max, false);
  assert.equal(isInTarget(onlyA, state.targets), false);
});

test("ações inválidas são ignoradas e o estado resolvido fica estável", () => {
  const game = getGameById("distribution");
  const state = game.createInitialState();
  assert.equal(game.reduce(state, { type: "unknown" }), state);
  assert.equal(game.reduce(state, { type: "toggle-switch", index: 9 }), state);
  const solved = { ...state, solved: true };
  assert.equal(game.reduce(solved, { type: "toggle-switch", index: 0 }), solved);
});

test("estado ausente ou malformado vira um estado vazio seguro", () => {
  assert.deepEqual(normalizeRoomState({}), emptyRoomState());
  assert.deepEqual(normalizeRoomState({ [STATE_KEY]: { version: 999 } }), emptyRoomState());
  assert.deepEqual(normalizeRoomState({ [STATE_KEY]: { version: 1, activeGameId: "distribution", sessionId: null } }), emptyRoomState());
});

test("comandos administrativos e ações exigem estrutura válida", () => {
  assert.equal(isValidRequest({ requestId: "abc-123", type: "start", gameId: "distribution" }), true);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "close", sessionId: "session-123" }), true);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "action", gameId: "distribution", sessionId: "session-123", action: { type: "toggle-switch", index: 2 } }), true);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "start", gameId: "" }), false);
  assert.equal(isValidRequest({ requestId: "x", type: "close", sessionId: "session-123" }), false);
  assert.equal(isValidRequest({ requestId: "abc-123", type: "action", gameId: "distribution", sessionId: "session-123", action: "toggle" }), false);
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
