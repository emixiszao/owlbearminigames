const SWITCH_COUNT = 4;
const METER_MIN = 0;
const METER_MAX = 100;
const TARGET_HALF_WIDTH = 3;
const EFFECT_VALUES = [-24, -20, -16, -12, -8, 8, 12, 16, 20, 24];

// Evita repetir a configuração imediatamente na mesma instância do núcleo.
const recentConfigurationSignatures = new Set();

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(random, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function maskToSwitches(mask) {
  return Array.from({ length: SWITCH_COUNT }, (_, index) => Boolean(mask & (1 << index)));
}

function switchesToMask(switches) {
  return switches.reduce((mask, isOn, index) => mask | (isOn ? 1 << index : 0), 0);
}

function hammingDistance(left, right) {
  let value = left ^ right;
  let count = 0;
  while (value) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

function getBases(effects) {
  const sumA = effects.reduce((sum, effect) => sum + effect.a, 0);
  const sumB = effects.reduce((sum, effect) => sum + effect.b, 0);
  // Todos os efeitos são múltiplos de quatro, portanto as bases ficam inteiras.
  return { a: 50 - sumA / 2, b: 50 - sumB / 2 };
}

export function calculateReadings(base, effects, switches) {
  return effects.reduce((readings, effect, index) => {
    if (switches[index]) {
      readings.a += effect.a;
      readings.b += effect.b;
    }
    return readings;
  }, { a: base.a, b: base.b });
}

export function isInTarget(readings, targets) {
  return readings.a >= targets.a.min && readings.a <= targets.a.max
    && readings.b >= targets.b.min && readings.b <= targets.b.max;
}

export function countSolutions(effects, base, targets) {
  let count = 0;
  for (let mask = 0; mask < (1 << SWITCH_COUNT); mask += 1) {
    const readings = calculateReadings(base, effects, maskToSwitches(mask));
    if (isInTarget(readings, targets)) count += 1;
  }
  return count;
}

function createCandidate(random) {
  const effects = [];
  for (let index = 0; index < SWITCH_COUNT; index += 1) {
    effects.push({
      a: EFFECT_VALUES[randomInt(random, 0, EFFECT_VALUES.length - 1)],
      b: EFFECT_VALUES[randomInt(random, 0, EFFECT_VALUES.length - 1)],
    });
  }

  // Evita interruptores visualmente iguais na tabela de efeitos.
  if (new Set(effects.map((effect) => `${effect.a},${effect.b}`)).size !== SWITCH_COUNT) return null;

  // Mantém todas as leituras possíveis dentro da escala 0–100.
  if (effects.reduce((sum, effect) => sum + Math.abs(effect.a), 0) > 96) return null;
  if (effects.reduce((sum, effect) => sum + Math.abs(effect.b), 0) > 96) return null;

  const base = getBases(effects);
  const masks = shuffle(Array.from({ length: 1 << SWITCH_COUNT }, (_, index) => index), random);

  for (const solutionMask of masks) {
    const targetReadings = calculateReadings(base, effects, maskToSwitches(solutionMask));
    if (targetReadings.a < 18 || targetReadings.a > 82 || targetReadings.b < 18 || targetReadings.b > 82) continue;

    const targets = {
      a: { min: targetReadings.a - TARGET_HALF_WIDTH, max: targetReadings.a + TARGET_HALF_WIDTH, center: targetReadings.a },
      b: { min: targetReadings.b - TARGET_HALF_WIDTH, max: targetReadings.b + TARGET_HALF_WIDTH, center: targetReadings.b },
    };

    // As zonas têm largura menor que a menor variação (4 unidades). A validação
    // explícita também protege contra futuras mudanças nos valores de efeito.
    if (countSolutions(effects, base, targets) !== 1) continue;

    const startingMasks = shuffle(
      Array.from({ length: 1 << SWITCH_COUNT }, (_, index) => index)
        .filter((mask) => hammingDistance(mask, solutionMask) >= 2),
      random,
    );
    const initialMask = startingMasks[0];
    if (initialMask === undefined) continue;

    const switches = maskToSwitches(initialMask);
    const readings = calculateReadings(base, effects, switches);
    const signature = JSON.stringify({ effects, solutionMask, initialMask, targets });
    return {
      signature,
      state: {
        switches,
        effects,
        base,
        targets,
        readings,
        solved: isInTarget(readings, targets),
      },
    };
  }
  return null;
}

function createFallbackCandidate() {
  // Fallback determinístico conhecido: as 16 combinações têm leituras distintas.
  const effects = [
    { a: -24, b: 20 },
    { a: -20, b: 8 },
    { a: -24, b: 24 },
    { a: -16, b: 8 },
  ];
  const base = getBases(effects);
  const solutionMask = 3;
  const targetReadings = calculateReadings(base, effects, maskToSwitches(solutionMask));
  const targets = {
    a: { min: targetReadings.a - TARGET_HALF_WIDTH, max: targetReadings.a + TARGET_HALF_WIDTH, center: targetReadings.a },
    b: { min: targetReadings.b - TARGET_HALF_WIDTH, max: targetReadings.b + TARGET_HALF_WIDTH, center: targetReadings.b },
  };
  const initialMask = 12;
  const switches = maskToSwitches(initialMask);
  const readings = calculateReadings(base, effects, switches);
  return {
    signature: JSON.stringify({ effects, solutionMask, initialMask, targets }),
    state: { switches, effects, base, targets, readings, solved: isInTarget(readings, targets) },
  };
}

export function generateDistributionState(random = Math.random) {
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    const candidate = createCandidate(random);
    if (!candidate || recentConfigurationSignatures.has(candidate.signature)) continue;
    if (candidate.state.solved) continue;
    recentConfigurationSignatures.add(candidate.signature);
    if (recentConfigurationSignatures.size > 256) recentConfigurationSignatures.delete(recentConfigurationSignatures.values().next().value);
    return candidate.state;
  }

  const fallback = createFallbackCandidate();
  if (recentConfigurationSignatures.has(fallback.signature)) {
    // Troca o estado inicial mantendo a mesma solução matemática; evita repetir
    // a experiência imediatamente caso o gerador aleatório falhe repetidamente.
    fallback.state.switches = maskToSwitches(5);
    fallback.state.readings = calculateReadings(fallback.state.base, fallback.state.effects, fallback.state.switches);
    fallback.state.solved = isInTarget(fallback.state.readings, fallback.state.targets);
    fallback.signature = `${fallback.signature}:alternate-start`;
  }
  recentConfigurationSignatures.add(fallback.signature);
  if (recentConfigurationSignatures.size > 256) recentConfigurationSignatures.delete(recentConfigurationSignatures.values().next().value);
  return fallback.state;
}

export const distributionGame = {
  id: "distribution",
  name: "Distribuição",
  description: "Estabilize corrente e tensão ajustando quatro interruptores do painel elétrico.",
  category: "Painel elétrico",

  createInitialState() {
    return generateDistributionState();
  },

  reduce(state, action) {
    if (!state || !Array.isArray(state.switches) || state.switches.length !== SWITCH_COUNT) return state;
    if (!action || action.type !== "toggle-switch" || !Number.isInteger(action.index) || action.index < 0 || action.index >= SWITCH_COUNT) return state;
    if (state.solved) return state;

    const switches = [...state.switches];
    switches[action.index] = !switches[action.index];
    const readings = calculateReadings(state.base, state.effects, switches);
    return {
      ...state,
      switches,
      readings,
      solved: isInTarget(readings, state.targets),
    };
  },

  styles: `
    .game-panel {
      width: min(94vw, 900px) !important;
      max-height: min(91vh, 760px) !important;
      overflow: auto !important;
      border: 3px solid #252825 !important;
      border-radius: 7px !important;
      background:
        radial-gradient(ellipse at 18% 8%, rgba(255,255,255,.14), transparent 32%),
        radial-gradient(ellipse at 85% 82%, rgba(0,0,0,.22), transparent 48%),
        repeating-linear-gradient(0deg, rgba(255,255,255,.018) 0 1px, rgba(0,0,0,.018) 1px 3px),
        linear-gradient(135deg, #777971 0%, #565951 23%, #686a62 48%, #444741 100%) !important;
      box-shadow: 0 28px 90px rgba(0,0,0,.78), inset 0 0 0 2px #999b91, inset 0 0 0 6px #383b36, inset 0 0 25px rgba(0,0,0,.48) !important;
      color: #e9e8df !important;
    }
    .game-header {
      padding: 18px 24px 13px !important;
      background: linear-gradient(180deg, rgba(20,22,20,.62), rgba(20,22,20,.12)) !important;
      border-bottom: 1px solid rgba(15,17,15,.72) !important;
    }
    .game-header .eyebrow { color: #c2c3b9 !important; letter-spacing: .18em !important; }
    .game-header h1 { color: #f1f0e6 !important; font-family: Georgia, 'Times New Roman', serif !important; font-size: clamp(20px, 3vw, 27px) !important; letter-spacing: .08em !important; text-shadow: 0 2px 3px #171916 !important; text-transform: uppercase; }
    .game-description { color: #d1d0c6 !important; }
    .game-divider { display: none !important; }
    .game-content { padding: 14px 22px 18px !important; }
    .game-footer { background: rgba(20,22,20,.45) !important; border-top: 1px solid rgba(20,22,20,.5) !important; color: #c1c2b8 !important; }
    .distribution-game { display: grid; gap: 12px; }
    .distribution-console {
      position: relative; padding: 16px 17px 14px; border: 2px solid #2e312d; border-radius: 8px;
      background:
        radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.12), transparent 45%),
        repeating-linear-gradient(90deg, rgba(255,255,255,.018) 0 1px, transparent 1px 4px),
        linear-gradient(145deg, #686b63, #4b4e47 52%, #5b5e56);
      box-shadow: inset 0 0 0 2px rgba(188,190,178,.28), inset 0 8px 18px rgba(0,0,0,.28), 0 7px 14px rgba(0,0,0,.24);
    }
    .console-topline { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid rgba(28,30,27,.58); color:#e1e0d5; font-size:10px; font-weight:800; letter-spacing:.15em; text-transform:uppercase; text-shadow:0 1px 2px #222; }
    .console-stamp { display:inline-flex; align-items:center; gap:7px; padding:4px 7px; border:1px solid rgba(28,30,27,.65); background:rgba(25,27,24,.24); color:#d4d3c8; letter-spacing:.08em; }
    .console-stamp::before { content:''; width:6px; height:6px; border-radius:50%; background:#d4a14a; box-shadow:0 0 6px rgba(212,161,74,.3); }
    .meter-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:16px; }
    .meter-module { min-width:0; padding:8px 8px 9px; border:2px solid #343731; border-radius:7px; background:linear-gradient(145deg, rgba(20,22,20,.65), rgba(35,37,33,.76)); box-shadow:inset 0 0 0 2px rgba(148,150,140,.15), 0 2px 4px rgba(0,0,0,.3); }
    .meter-module.is-stable { border-color:#53745c; box-shadow:inset 0 0 0 2px rgba(116,183,128,.15), 0 0 12px rgba(69,159,91,.12); }
    .meter-label { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:1px 4px 5px; color:#d9d8ce; font-size:10px; font-weight:850; letter-spacing:.15em; text-transform:uppercase; }
    .meter-status { color:#bdbdb1; font-size:9px; letter-spacing:.08em; white-space:nowrap; }
    .meter-module.is-stable .meter-status { color:#9be0a4; }
    .meter-svg { display:block; width:100%; max-height:194px; margin:0 auto; overflow:visible; }
    .meter-svg .needle { transform-box:view-box; transform-origin:50% 79.375%; transition:transform .48s cubic-bezier(.2,.75,.25,1); }
    .meter-readout { display:flex; align-items:baseline; justify-content:center; gap:6px; margin-top:-2px; color:#f0eee3; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; text-shadow:0 1px 2px #000; }
    .meter-readout strong { font-size:clamp(18px, 2.4vw, 24px); font-weight:800; letter-spacing:.04em; }
    .meter-readout span { color:#c1c1b6; font-size:11px; }
    .switch-section { margin-top:15px; padding-top:13px; border-top:3px solid rgba(25,27,24,.64); box-shadow:0 -1px rgba(185,186,174,.16); }
    .switch-section-title { margin:0 0 10px; color:#d7d6cb; font-size:10px; font-weight:850; letter-spacing:.16em; text-align:center; text-transform:uppercase; text-shadow:0 1px 2px #222; }
    .breaker-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
    .breaker { display:flex; flex-direction:column; align-items:center; gap:6px; min-width:0; padding:8px 7px 9px; border:2px solid #343731; border-radius:5px; color:#e5e3d9; background:linear-gradient(135deg, #5a5d55, #3b3e38); box-shadow:inset 0 0 0 1px rgba(180,182,170,.18), 0 3px 5px rgba(0,0,0,.25); cursor:pointer; transition:filter .12s ease, border-color .12s ease; }
    .breaker:hover:not(:disabled) { filter:brightness(1.12); border-color:#b1b3a8; }
    .breaker:focus-visible { outline:2px solid #e6c06d; outline-offset:3px; }
    .breaker:disabled { opacity:1; cursor:default; }
    .breaker-id { color:#bdbeb4; font-size:9px; font-weight:850; letter-spacing:.1em; }
    .breaker-bezel { display:flex; align-items:center; justify-content:center; width:min(100%, 78px); height:94px; padding:6px; border:2px solid #272a26; border-radius:5px; background:linear-gradient(90deg, #222420, #53564e 18%, #272a26 40%, #11130f 100%); box-shadow:inset 0 0 0 1px rgba(195,197,185,.18), 0 1px 3px #222; }
    .breaker-rocker { position:relative; display:flex; align-items:center; justify-content:center; width:100%; height:100%; border:2px solid #11130f; border-radius:4px; background:linear-gradient(90deg, #151713, #33362f 40%, #171914); box-shadow:inset 0 0 8px rgba(0,0,0,.8); }
    .breaker-lever { position:absolute; left:7%; width:86%; height:35px; border:2px solid #171915; border-radius:3px; background:linear-gradient(180deg, #686b62 0%, #3c3f38 48%, #22241f 100%); box-shadow:0 3px 4px rgba(0,0,0,.7), inset 0 1px rgba(255,255,255,.16); transition:top .18s ease, background .18s ease; }
    .breaker.is-on .breaker-lever { top:7px; background:linear-gradient(180deg, #7ac56b 0%, #318b38 48%, #1d5227 100%); }
    .breaker.is-off .breaker-lever { top:calc(100% - 42px); background:linear-gradient(180deg, #bd6659 0%, #87352e 48%, #4d201d 100%); }
    .breaker-legend { display:flex; width:100%; justify-content:space-between; gap:5px; color:#8e9085; font-size:9px; font-weight:900; letter-spacing:.06em; }
    .breaker.is-on .on-label { color:#b8f0a9; text-shadow:0 0 7px rgba(96,207,90,.38); }
    .breaker.is-off .off-label { color:#f0b1a7; text-shadow:0 0 7px rgba(230,76,62,.25); }
    .breaker-caption { color:#d0cfc4; font-size:9px; font-weight:750; letter-spacing:.06em; text-align:center; }
    .distribution-status { display:flex; align-items:center; justify-content:center; gap:9px; min-height:35px; padding:8px 10px; border:1px solid rgba(20,22,19,.65); background:rgba(22,24,21,.54); color:#d6d5ca; font-size:10px; font-weight:850; letter-spacing:.12em; text-align:center; text-transform:uppercase; }
    .status-lamp { width:8px; height:8px; flex:none; border-radius:50%; background:#d39b3f; box-shadow:0 0 7px rgba(211,155,63,.4); }
    .distribution-game.is-solved .status-lamp { background:#80e18b; box-shadow:0 0 12px rgba(101,232,119,.8); }
    .distribution-game.is-solved .distribution-status { color:#c4f4c8; border-color:rgba(110,211,120,.38); }
    .console-screws { position:absolute; width:7px; height:7px; border:1px solid #282a26; border-radius:50%; background:radial-gradient(circle at 35% 30%, #b3b5a9, #51544c 55%, #292b27); box-shadow:0 1px 2px #222; }
    .console-screws.tl { top:6px; left:6px; } .console-screws.tr { top:6px; right:6px; } .console-screws.bl { bottom:6px; left:6px; } .console-screws.br { bottom:6px; right:6px; }
    @media (max-width: 620px) {
      .game-panel { width: min(96vw, 540px) !important; }
      .game-header { padding:14px 15px 10px !important; }
      .game-content { padding:10px 10px 13px !important; }
      .distribution-console { padding:12px 9px 10px; }
      .meter-grid { gap:7px; }
      .meter-module { padding:6px 4px 7px; }
      .meter-label { font-size:8px; letter-spacing:.08em; }
      .meter-status { font-size:7px; }
      .breaker-grid { gap:5px; }
      .breaker { padding:6px 3px 7px; }
      .breaker-bezel { height:76px; padding:4px; }
      .breaker-lever { height:29px; }
      .breaker.is-off .breaker-lever { top:calc(100% - 35px); }
      .breaker-id, .breaker-caption, .breaker-legend { font-size:7px; }
      .console-topline { font-size:8px; }
    }
    @media (max-width: 390px) {
      .meter-grid { grid-template-columns:1fr; }
      .meter-svg { max-height:150px; max-width:260px; }
      .breaker-bezel { height:68px; }
    }
  `,

  render(container, state, context) {
    const safeState = state && Array.isArray(state.switches) && state.switches.length === SWITCH_COUNT
      ? state
      : generateDistributionState();
    const solved = Boolean(safeState.solved);

    function gaugeSvg(label, unit, value, target) {
      const point = (reading, radius) => {
        const angle = (180 - reading * 1.8) * Math.PI / 180;
        return { x: 120 + radius * Math.cos(angle), y: 124 - radius * Math.sin(angle) };
      };
      const arc = (from, to, radius) => {
        const points = [];
        for (let reading = from; reading <= to + 0.001; reading += 0.5) {
          const p = point(reading, radius);
          points.push(`${points.length ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
        }
        const end = point(to, radius);
        points.push(`L${end.x.toFixed(2)},${end.y.toFixed(2)}`);
        return points.join(" ");
      };
      const ticks = Array.from({ length: 11 }, (_, index) => {
        const reading = index * 10;
        const outer = point(reading, 79);
        const inner = point(reading, index % 2 === 0 ? 64 : 69);
        const labelPoint = point(reading, 53);
        const major = index % 2 === 0;
        return `<line x1="${outer.x.toFixed(2)}" y1="${outer.y.toFixed(2)}" x2="${inner.x.toFixed(2)}" y2="${inner.y.toFixed(2)}" stroke="${major ? "#dddccf" : "#aaa99e"}" stroke-width="${major ? 2 : 1.2}" />${major ? `<text x="${labelPoint.x.toFixed(2)}" y="${(labelPoint.y + 3).toFixed(2)}" text-anchor="middle" fill="#e0dfd3" font-size="9" font-family="Arial,sans-serif">${index}</text>` : ""}`;
      }).join("");
      const angle = value * 1.8 - 90;
      const stable = value >= target.min && value <= target.max;
      return `
        <svg class="meter-svg" viewBox="0 0 240 160" role="img" aria-label="Medidor de ${label.toLowerCase()}: ${value / 10} ${unit}; alvo entre ${target.min / 10} e ${target.max / 10}.">
          <defs>
            <linearGradient id="face-${unit}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#262923"/><stop offset=".48" stop-color="#474a41"/><stop offset="1" stop-color="#191b17"/></linearGradient>
            <linearGradient id="glass-${unit}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f0dc"/><stop offset=".5" stop-color="#c5c3b2"/><stop offset="1" stop-color="#77796f"/></linearGradient>
          </defs>
          <rect x="5" y="4" width="230" height="150" rx="7" fill="#222520" stroke="#191b17" stroke-width="3"/>
          <rect x="10" y="9" width="220" height="140" rx="5" fill="url(#face-${unit})" stroke="#85877c" stroke-width="1.5"/>
          <rect x="17" y="15" width="206" height="120" rx="3" fill="url(#glass-${unit})" stroke="#2d302a" stroke-width="2"/>
          <path d="M20 18 H220 V48 Q120 27 20 48 Z" fill="rgba(255,255,255,.12)"/>
          <path d="${arc(0, 100, 82)}" fill="none" stroke="#373a33" stroke-width="5" stroke-linecap="round"/>
          <path d="${arc(target.min, target.max, 82)}" fill="none" stroke="#d9473e" stroke-width="8" stroke-linecap="round"/>
          ${ticks}
          <text x="120" y="88" text-anchor="middle" fill="#30332d" font-size="10" font-weight="800" letter-spacing="2" font-family="Arial,sans-serif">${label}</text>
          <text x="120" y="105" text-anchor="middle" fill="#252821" font-size="10" font-weight="800" font-family="Arial,sans-serif">${unit}</text>
          <g class="needle" style="transform:rotate(${angle}deg)">
            <line x1="120" y1="124" x2="120" y2="49" stroke="#161814" stroke-width="5" stroke-linecap="round"/>
            <line x1="120" y1="123" x2="120" y2="53" stroke="#d5d3c6" stroke-width="2" stroke-linecap="round"/>
          </g>
          <circle cx="120" cy="124" r="8" fill="#20231e" stroke="#a3a498" stroke-width="2"/>
          <circle cx="120" cy="124" r="3" fill="#d0cfc3"/>
          <circle cx="25" cy="23" r="2.5" fill="#292c26"/><circle cx="215" cy="23" r="2.5" fill="#292c26"/>
          <rect x="18" y="137" width="204" height="8" fill="rgba(0,0,0,.2)"/>
          <text x="120" y="144" text-anchor="middle" fill="${stable ? "#c6edbf" : "#c9c8bc"}" font-size="7" font-weight="800" letter-spacing="1.4" font-family="Arial,sans-serif">${stable ? "FAIXA ATINGIDA" : "PAINEL C - ANALÓGICO"}</text>
        </svg>
      `;
    }

    const meter = (key, label, unit) => {
      const value = safeState.readings[key];
      const target = safeState.targets[key];
      const stable = value >= target.min && value <= target.max;
      return `<section class="meter-module ${stable ? "is-stable" : ""}" aria-label="Medidor de ${label}">
        <div class="meter-label"><span>${label}</span><span class="meter-status">${stable ? "NO ALVO" : "FORA DA FAIXA"}</span></div>
        ${gaugeSvg(label, unit, value, target)}
        <div class="meter-readout"><strong>${(value / 10).toFixed(1)}</strong><span>${unit}</span></div>
      </section>`;
    };

    const breakers = safeState.switches.map((isOn, index) => `
      <button type="button" class="breaker ${isOn ? "is-on" : "is-off"}" data-switch="${index}" aria-pressed="${isOn}" aria-label="Interruptor ${index + 1}, ${isOn ? "ligado" : "desligado"}" ${solved ? "disabled" : ""}>
        <span class="breaker-id">CHAVE 0${index + 1}</span>
        <span class="breaker-bezel"><span class="breaker-rocker"><span class="breaker-lever"></span></span></span>
        <span class="breaker-legend"><span class="on-label">ON</span><span class="off-label">OFF</span></span>
        <span class="breaker-caption">${isOn ? "LIGADO" : "DESLIGADO"}</span>
      </button>
    `).join("");

    container.innerHTML = `
      <div class="distribution-game ${solved ? "is-solved" : ""}">
        <section class="distribution-console" aria-label="Painel elétrico de distribuição">
          <span class="console-screws tl" aria-hidden="true"></span><span class="console-screws tr" aria-hidden="true"></span>
          <span class="console-screws bl" aria-hidden="true"></span><span class="console-screws br" aria-hidden="true"></span>
          <div class="console-topline"><span>PAINEL Nº D-04</span><span class="console-stamp">DISTRIBUIÇÃO ELÉTRICA</span></div>
          <div class="meter-grid">${meter("a", "Corrente", "A")}${meter("b", "Tensão", "V")}</div>
          <section class="switch-section" aria-label="Quatro interruptores">
            <h2 class="switch-section-title">Controles de distribuição</h2>
            <div class="breaker-grid">${breakers}</div>
          </section>
        </section>
        <div class="distribution-status" role="status" aria-live="polite"><span class="status-lamp" aria-hidden="true"></span><span>${solved ? "DISTRIBUIÇÃO ESTÁVEL — SISTEMA NORMALIZADO" : "SISTEMA ATIVO — ESTABILIZE OS DOIS MEDIDORES"}</span></div>
      </div>
    `;

    container.querySelectorAll("[data-switch]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-switch"));
        if (Number.isInteger(index) && index >= 0 && index < SWITCH_COUNT && !solved) {
          context.dispatch({ type: "toggle-switch", index });
        }
      });
    });
  },
};
