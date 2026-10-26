import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3";
import { getGameById, validateRegistry } from "./registry.js";
import { isAllowedCommand } from "./permissions.js";
import {
  BROADCAST_CHANNEL,
  STATE_KEY,
  WINDOW_ID,
  createSessionId,
  isValidRequest,
  normalizeRoomState,
} from "./constants.js";

let selfConnectionId = null;
let currentRole = "PLAYER";
let activeSessionId = null;
let requestQueue = Promise.resolve();
let reconcileQueue = Promise.resolve();
const seenRequests = new Set();
const MAX_SEEN_REQUESTS = 600;

function rememberRequest(id) {
  seenRequests.add(id);
  if (seenRequests.size > MAX_SEEN_REQUESTS) {
    const oldest = seenRequests.values().next().value;
    if (oldest) seenRequests.delete(oldest);
  }
}

async function roleForConnection(connectionId) {
  if (connectionId && connectionId === selfConnectionId) {
    currentRole = await OBR.player.getRole();
    return currentRole;
  }
  const players = await OBR.party.getPlayers();
  return players.find((player) => player.connectionId === connectionId)?.role ?? null;
}

async function isAuthorityMaster() {
  currentRole = await OBR.player.getRole();
  if (currentRole !== "GM" || !selfConnectionId) return false;
  const players = await OBR.party.getPlayers();
  const gmConnections = players
    .filter((player) => player.role === "GM" && typeof player.connectionId === "string")
    .map((player) => player.connectionId);
  gmConnections.push(selfConnectionId);
  gmConnections.sort();
  // Se a sala tiver mais de uma conexão GM, todas elegem a mesma autoridade por ordem estável.
  return gmConnections[0] === selfConnectionId;
}

async function processRequest(event) {
  const message = event?.data;
  if (!isValidRequest(message) || seenRequests.has(message.requestId)) return;
  rememberRequest(message.requestId);

  const senderRole = await roleForConnection(event.connectionId);
  // Só uma instância GM eleita processa comandos e grava o estado compartilhado.
  if (!(await isAuthorityMaster())) return;

  if (!isAllowedCommand(senderRole, message.type)) return;

  const current = normalizeRoomState(await OBR.room.getMetadata());

  if (message.type === "start") {
    const game = getGameById(message.gameId);
    if (!game) return;
    const initialState = game.createInitialState();
    await OBR.room.setMetadata({
      [STATE_KEY]: {
        version: 1,
        activeGameId: game.id,
        sessionId: createSessionId(),
        gameState: initialState && typeof initialState === "object" && !Array.isArray(initialState) ? initialState : {},
      },
    });
    return;
  }

  if (message.type === "close") {
    if (!current.activeGameId || !current.sessionId || message.sessionId !== current.sessionId) return;
    await OBR.room.setMetadata({
      [STATE_KEY]: { version: 1, activeGameId: null, sessionId: null, gameState: {} },
    });
    return;
  }

  if (message.type === "action") {
    if (!current.activeGameId || !current.sessionId) return;
    if (message.gameId !== current.activeGameId || message.sessionId !== current.sessionId) return;
    const game = getGameById(current.activeGameId);
    if (!game) return;
    const nextGameState = game.reduce(current.gameState, message.action);
    if (!nextGameState || typeof nextGameState !== "object" || Array.isArray(nextGameState)) return;

    // O processamento é serializado nesta instância do mestre para que ações rápidas
    // usem sempre o estado mais recente, sem sobrescrever o resultado umas das outras.
    await OBR.room.setMetadata({
      [STATE_KEY]: {
        version: 1,
        activeGameId: current.activeGameId,
        sessionId: current.sessionId,
        gameState: nextGameState,
      },
    });
  }
}

function enqueueRequest(event) {
  requestQueue = requestQueue
    .then(() => processRequest(event))
    .catch((error) => {
      console.error("[Minigames VTT] Erro ao processar comando:", error);
    });
}

async function reconcileWindow(metadata) {
  const state = normalizeRoomState(metadata);
  const game = state.activeGameId ? getGameById(state.activeGameId) : null;

  if (!game || !state.sessionId) {
    try {
      await OBR.popover.close(WINDOW_ID);
    } catch {
      // A janela pode já estar fechada.
    }
    activeSessionId = null;
    return;
  }

  if (activeSessionId === state.sessionId) return;

  try {
    await OBR.popover.close(WINDOW_ID);
  } catch {
    // A janela pode ainda não existir neste cliente.
  }

  const viewportWidth = await OBR.viewport.getWidth().catch(() => window.innerWidth || 1024);
  const viewportHeight = await OBR.viewport.getHeight().catch(() => window.innerHeight || 768);
  const width = Math.max(320, Math.floor(Number(viewportWidth) || window.innerWidth || 1024));
  const height = Math.max(240, Math.floor(Number(viewportHeight) || window.innerHeight || 768));
  const url = new URL("../game.html", import.meta.url);
  url.searchParams.set("game", game.id);
  url.searchParams.set("session", state.sessionId);

  await OBR.popover.open({
    id: WINDOW_ID,
    url: url.href,
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: { left: width / 2, top: height / 2 },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    marginThreshold: 0,
    hidePaper: true,
    disableClickAway: true,
  });
  activeSessionId = state.sessionId;
}

function enqueueReconcile(metadata) {
  reconcileQueue = reconcileQueue
    .then(() => reconcileWindow(metadata))
    .catch((error) => console.error("[Minigames VTT] Erro ao sincronizar janela:", error));
}

OBR.onReady(async () => {
  try {
    validateRegistry();
    selfConnectionId = await OBR.player.getConnectionId();
    currentRole = await OBR.player.getRole();

    OBR.broadcast.onMessage(BROADCAST_CHANNEL, (event) => enqueueRequest(event));
    OBR.room.onMetadataChange((metadata) => enqueueReconcile(metadata));

    const metadata = await OBR.room.getMetadata();
    enqueueReconcile(metadata);

    // A janela de cada cliente é reconciliada com o estado compartilhado.
    // Isso também recupera a exibição se a interface for dispensada localmente.
    window.setInterval(async () => {
      try {
        const metadata = await OBR.room.getMetadata();
        const state = normalizeRoomState(metadata);
        if (state.activeGameId && state.sessionId && state.sessionId === activeSessionId) {
          const width = await OBR.popover.getWidth(WINDOW_ID).catch(() => undefined);
          if (width === undefined || width === null || width <= 0) activeSessionId = null;
        }
        enqueueReconcile(metadata);
      } catch (error) {
        console.error("[Minigames VTT] Erro na verificação da janela:", error);
      }
    }, 1800);
  } catch (error) {
    console.error("[Minigames VTT] Falha ao iniciar o núcleo:", error);
  }
});
