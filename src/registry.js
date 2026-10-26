import { distributionGame } from "./games/distribution.js";

// Registre novos minigames adicionando-os a esta lista.
// Cada jogo implementa: id, name, description, createInitialState(), reduce() e render().
export const GAMES = [distributionGame];

export function getGameById(id) {
  return GAMES.find((game) => game.id === id) ?? null;
}

export function validateRegistry(games = GAMES) {
  const ids = new Set();
  for (const game of games) {
    if (!game || typeof game.id !== "string" || !game.id.trim()) throw new Error("Todo minigame precisa de um id.");
    if (ids.has(game.id)) throw new Error(`ID de minigame duplicado: ${game.id}`);
    if (typeof game.name !== "string" || typeof game.description !== "string") throw new Error(`Metadados ausentes em ${game.id}.`);
    if (typeof game.createInitialState !== "function" || typeof game.reduce !== "function" || typeof game.render !== "function") {
      throw new Error(`O minigame ${game.id} não implementa a interface obrigatória.`);
    }
    ids.add(game.id);
  }
  return true;
}
