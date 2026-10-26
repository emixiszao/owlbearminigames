import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3";
import { getGameById } from "./registry.js";
import { BROADCAST_CHANNEL, createRequestId, normalizeRoomState } from "./constants.js";

const params = new URLSearchParams(window.location.search);
const requestedGameId = params.get("game");
const requestedSessionId = params.get("session");
const title = document.getElementById("game-title");
const description = document.getElementById("game-description");
const content = document.getElementById("game-content");
const closeButton = document.getElementById("close-game");
const styleElement = document.createElement("style");
document.head.append(styleElement);

let isGM = false;
let currentGame = null;
let lastRenderKey = "";

function showMessage(message) {
  content.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "loading-state";
  paragraph.textContent = message;
  content.append(paragraph);
}

async function dispatch(request) {
  try {
    await OBR.broadcast.sendMessage(BROADCAST_CHANNEL, {
      ...request,
      requestId: createRequestId(),
    }, { destination: "ALL" });
  } catch (error) {
    showMessage(`Não foi possível enviar a ação: ${error?.message ?? error}`);
  }
}

function render(metadata) {
  const state = normalizeRoomState(metadata);
  if (state.activeGameId !== requestedGameId || state.sessionId !== requestedSessionId) {
    showMessage("Sincronizando a janela com o estado atual da mesa…");
    return;
  }

  const game = getGameById(state.activeGameId);
  if (!game) {
    showMessage("Este minigame não está registrado nesta versão da extensão.");
    return;
  }

  currentGame = game;
  title.textContent = game.name;
  description.textContent = game.description;
  styleElement.textContent = game.styles ?? "";
  closeButton.hidden = !isGM;

  const renderKey = JSON.stringify({ gameId: game.id, sessionId: state.sessionId, gameState: state.gameState });
  if (renderKey === lastRenderKey) return;
  lastRenderKey = renderKey;

  game.render(content, state.gameState, {
    isGM,
    dispatch: (action) => dispatch({
      type: "action",
      gameId: game.id,
      sessionId: state.sessionId,
      action,
    }),
  });
}

// O painel compartilhado não possui fechamento local para jogadores.
// O Escape é consumido no iframe; o popover também usa disableClickAway.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}, true);

closeButton.addEventListener("click", async () => {
  if (!isGM) return;
  const state = normalizeRoomState(await OBR.room.getMetadata());
  if (!state.sessionId || state.sessionId !== requestedSessionId) return;
  await dispatch({ type: "close", sessionId: state.sessionId });
});

OBR.onReady(async () => {
  try {
    isGM = (await OBR.player.getRole()) === "GM";
    closeButton.hidden = !isGM;
    OBR.player.onChange((player) => {
      isGM = player.role === "GM";
      closeButton.hidden = !isGM;
    });
    render(await OBR.room.getMetadata());
    OBR.room.onMetadataChange((metadata) => render(metadata));
  } catch (error) {
    showMessage(`Não foi possível conectar ao Owlbear Rodeo: ${error?.message ?? error}`);
  }
});
