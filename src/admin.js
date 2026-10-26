import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3";
import { GAMES, getGameById, validateRegistry } from "./registry.js";
import { BROADCAST_CHANNEL, createRequestId, normalizeRoomState } from "./constants.js";

const root = document.getElementById("admin-root");
let isGM = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(message, kind = "info") {
  const status = document.getElementById("admin-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

async function sendRequest(request) {
  if (!isGM) {
    setStatus("Apenas o mestre pode controlar os minigames.", "error");
    return;
  }
  try {
    await OBR.broadcast.sendMessage(BROADCAST_CHANNEL, {
      ...request,
      requestId: createRequestId(),
    }, { destination: "ALL" });
    setStatus("Comando enviado. Sincronizando com a mesa…", "info");
  } catch (error) {
    setStatus(`Não foi possível enviar o comando: ${error?.message ?? error}`, "error");
  }
}

function render(state) {
  if (!isGM) return;
  const activeGame = state.activeGameId ? getGameById(state.activeGameId) : null;
  const activeBox = document.getElementById("active-game");
  const activeName = document.getElementById("active-game-name");
  const activeMeta = document.getElementById("active-game-meta");
  const closeButton = document.getElementById("admin-close-game");
  const list = document.getElementById("game-list");

  activeBox.hidden = !activeGame;
  closeButton.hidden = !activeGame;
  if (activeGame) {
    activeName.textContent = activeGame.name;
    activeMeta.textContent = "Em execução para todos os participantes";
  } else {
    activeName.textContent = "Nenhum minigame ativo";
    activeMeta.textContent = "Selecione um jogo para iniciar a atividade.";
  }

  list.replaceChildren();
  for (const game of GAMES) {
    const card = el("article", "game-card");
    const cardTop = el("div", "game-card-top");
    const category = el("span", "game-category", game.category ?? "Minigame");
    const title = el("h2", "game-card-title", game.name);
    const description = el("p", "game-card-description", game.description);
    const button = el("button", "button button-primary", activeGame?.id === game.id ? "Em execução" : "Iniciar minigame");
    button.type = "button";
    button.disabled = activeGame?.id === game.id;
    button.addEventListener("click", () => sendRequest({ type: "start", gameId: game.id }));
    cardTop.append(category, title);
    card.append(cardTop, description, button);
    list.append(card);
  }

  const statusText = document.getElementById("admin-status")?.textContent ?? "";
  if (activeGame && (statusText.startsWith("Comando enviado") || statusText.startsWith("Carregando"))) {
    setStatus(`Minigame ativo: ${activeGame.name}. A janela foi sincronizada com a mesa.`);
  } else if (!activeGame && (statusText.startsWith("Comando enviado") || statusText.startsWith("Carregando"))) {
    setStatus("Pronto para iniciar um minigame.");
  }
}

function mountAdmin() {
  root.replaceChildren();
  const header = el("header", "admin-header");
  header.append(
    el("div", "eyebrow", "FERRAMENTAS DO MESTRE"),
    el("h1", "admin-title", "Minigames"),
    el("p", "admin-subtitle", "Escolha um desafio para abrir uma janela compartilhada na mesa.")
  );

  const activeBox = el("section", "active-game-box");
  activeBox.id = "active-game";
  activeBox.hidden = true;
  const activeText = el("div", "active-game-text");
  activeText.append(
    el("span", "active-game-label", "MINIGAME ATIVO"),
    el("strong", "active-game-name", "Nenhum minigame ativo"),
    el("span", "active-game-meta", "Selecione um jogo para iniciar a atividade.")
  );
  activeText.children[1].id = "active-game-name";
  activeText.children[2].id = "active-game-meta";
  const closeButton = el("button", "button button-danger", "Encerrar");
  closeButton.id = "admin-close-game";
  closeButton.type = "button";
  closeButton.hidden = true;
  closeButton.addEventListener("click", async () => {
    const state = normalizeRoomState(await OBR.room.getMetadata());
    if (!state.sessionId) return;
    await sendRequest({ type: "close", sessionId: state.sessionId });
  });
  activeBox.append(activeText, closeButton);

  const listHeader = el("div", "section-heading");
  listHeader.append(el("h2", "section-title", "Jogos disponíveis"), el("span", "section-count", `${GAMES.length} registrado(s)`));
  const list = el("section", "game-list");
  list.id = "game-list";
  const status = el("p", "admin-status", "Carregando estado da sala…");
  status.id = "admin-status";
  status.setAttribute("role", "status");
  const note = el("p", "admin-note", "Os jogadores podem interagir com o minigame aberto, mas somente o mestre pode iniciar ou encerrar jogos.");
  root.append(header, activeBox, listHeader, list, status, note);
}

OBR.onReady(async () => {
  try {
    isGM = (await OBR.player.getRole()) === "GM";
    if (!isGM) {
      root.innerHTML = `<section class="access-denied"><div class="denied-icon" aria-hidden="true">⌁</div><div class="eyebrow">ACESSO RESTRITO</div><h1>Área do mestre</h1><p>A administração dos minigames está disponível somente para o mestre da mesa.</p></section>`;
      await OBR.action.setWidth(300);
      await OBR.action.setHeight(190);
      return;
    }

    validateRegistry();
    await OBR.action.setWidth(360);
    await OBR.action.setHeight(520);
    mountAdmin();
    render(normalizeRoomState(await OBR.room.getMetadata()));
    OBR.room.onMetadataChange((metadata) => render(normalizeRoomState(metadata)));
    OBR.player.onChange((player) => {
      isGM = player.role === "GM";
      if (!isGM) {
        root.innerHTML = `<section class="access-denied"><div class="eyebrow">ACESSO RESTRITO</div><h1>Área do mestre</h1><p>Seu papel mudou. Os controles administrativos foram bloqueados.</p></section>`;
      }
    });
  } catch (error) {
    root.innerHTML = `<section class="access-denied"><h1>Não foi possível iniciar</h1><p>${String(error?.message ?? error)}</p></section>`;
  }
});
