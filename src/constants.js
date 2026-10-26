export const EXTENSION_ID = "com.cris.minigames";
export const STATE_KEY = `${EXTENSION_ID}/state`;
export const BROADCAST_CHANNEL = `${EXTENSION_ID}/events`;
export const WINDOW_ID = `${EXTENSION_ID}/window`;
export const STATE_VERSION = 1;

export function createRequestId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${randomPart}`;
}

export function createSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `session-${Date.now().toString(36)}-${randomPart}`;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function emptyRoomState() {
  return {
    version: STATE_VERSION,
    activeGameId: null,
    sessionId: null,
    gameState: {},
  };
}

export function normalizeRoomState(metadata) {
  const raw = isPlainObject(metadata) ? metadata[STATE_KEY] : undefined;
  if (!isPlainObject(raw) || raw.version !== STATE_VERSION) return emptyRoomState();

  const activeGameId = typeof raw.activeGameId === "string" && raw.activeGameId.length <= 100
    ? raw.activeGameId
    : null;
  const sessionId = activeGameId && typeof raw.sessionId === "string" && raw.sessionId.length <= 160
    ? raw.sessionId
    : null;

  return {
    version: STATE_VERSION,
    activeGameId: sessionId ? activeGameId : null,
    sessionId,
    gameState: sessionId && isPlainObject(raw.gameState) ? raw.gameState : {},
  };
}

export function isValidRequest(message) {
  if (!isPlainObject(message)) return false;
  if (typeof message.requestId !== "string" || message.requestId.length < 3 || message.requestId.length > 100) return false;
  if (!["start", "close", "action"].includes(message.type)) return false;
  if (message.type === "start") return typeof message.gameId === "string" && message.gameId.length > 0 && message.gameId.length <= 100;
  if (message.type === "close") return typeof message.sessionId === "string" && message.sessionId.length <= 160;
  return typeof message.gameId === "string"
    && message.gameId.length <= 100
    && typeof message.sessionId === "string"
    && message.sessionId.length <= 160
    && isPlainObject(message.action)
    && typeof message.action.type === "string"
    && message.action.type.length <= 100;
}
