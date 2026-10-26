export const demoSwitchGame = {
  id: "demo-switch",
  name: "Interruptor compartilhado",
  description: "Demonstra o estado e as ações sincronizadas entre os participantes.",
  category: "Demonstração técnica",

  createInitialState() {
    return { on: false, activations: 0 };
  },

  reduce(state, action) {
    if (!action || action.type !== "toggle-switch") return state;
    const current = state && typeof state === "object" ? state : this.createInitialState();
    const activations = Number.isFinite(current.activations)
      ? Math.max(0, Math.trunc(current.activations))
      : 0;
    return { on: !Boolean(current.on), activations: activations + 1 };
  },

  styles: `
    .switch-demo { display:grid; gap:18px; }
    .switch-status { display:flex; align-items:center; gap:14px; padding:18px; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.025); }
    .switch-lamp { width:48px; height:48px; flex:none; border-radius:50%; background:#34313f; border:3px solid #514b61; box-shadow:inset 0 0 12px rgba(0,0,0,.4); transition:all .18s ease; }
    .switch-lamp.is-on { background:#a7f3d0; border-color:#6ee7b7; box-shadow:0 0 24px rgba(110,231,183,.38), inset 0 0 8px rgba(255,255,255,.7); }
    .switch-state-title { margin:0 0 4px; font-size:16px; font-weight:750; }
    .switch-state-copy { margin:0; color:var(--muted); font-size:13px; line-height:1.45; }
    .switch-action { width:100%; min-height:46px; }
    .switch-metric { display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--line); color:var(--muted); font-size:13px; }
    .switch-metric strong { color:var(--text); font-size:16px; }
  `,

  render(container, state, context) {
    const isOn = Boolean(state?.on);
    const activations = Number.isFinite(state?.activations)
      ? Math.max(0, Math.trunc(state.activations))
      : 0;

    container.innerHTML = `
      <div class="switch-demo">
        <div class="switch-status">
          <div class="switch-lamp ${isOn ? "is-on" : ""}" aria-hidden="true"></div>
          <div>
            <p class="switch-state-title">${isOn ? "Interruptor ligado" : "Interruptor desligado"}</p>
            <p class="switch-state-copy">Todos veem o mesmo estado. Qualquer participante pode acionar o botão.</p>
          </div>
        </div>
        <button class="button button-primary switch-action" type="button" data-toggle>
          ${isOn ? "Desligar interruptor" : "Ligar interruptor"}
        </button>
        <div class="switch-metric"><span>Acionamentos processados</span><strong>${activations}</strong></div>
      </div>
    `;

    container.querySelector("[data-toggle]")?.addEventListener("click", () => {
      context.dispatch({ type: "toggle-switch" });
    });
  },
};
