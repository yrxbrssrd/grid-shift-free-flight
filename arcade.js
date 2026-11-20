import { createFlightAudio } from "./flight-audio.js";

const ui = Object.fromEntries(Array.from(document.querySelectorAll("[id]"), element => [element.id, element]));
const sim = window.GridOpenWorld;
const phaseNames = ["cyan", "pink"];
const phaseColors = ["#9af6ff", "#ff8bce"];
const flightKeys = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyQ", "KeyE", "KeyX", "KeyC",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
]);
const keys = new Set();
const scoreKey = "grid-shift-free-flight-best";
const circuitKey = "grid-shift-grand-circuit-best";
const mapContext = ui.map.getContext("2d");
let model = sim.createRun();
let pointer = null;
let touchLift = 0;
let queuedPhase = false;
let queuedDrop = false;
let selectedDistrict = 1;
let guidedStep = null;
let nextMapFrame = 0;
let mode = "menu";
let ready = false;
let sound = true;
let audioContext;
let flightAudio;
let renderer;
let messageUntil = 0;
let hitUntil = 0;
let best = 0;
let bestCircuit = 0;

try {
  best = Number(localStorage.getItem(scoreKey)) || 0;
  bestCircuit = Number(localStorage.getItem(circuitKey)) || 0;
} catch { /* Storage is optional. */ }

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function syncAudio() {
  flightAudio?.setState(sound && !document.hidden, mode);
}

function prepareAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!sound || !Audio || document.hidden) return;
  try {
    audioContext ||= new Audio();
    flightAudio ||= createFlightAudio(audioContext);
    if (audioContext.state !== "running") audioContext.resume().catch(() => {});
  } catch { /* Flight works without audio. */ }
}

function clearInput() {
  keys.clear();
  pointer = null;
  touchLift = 0;
  queuedPhase = false;
  queuedDrop = false;
}

function setMode(next) {
  mode = next;
  syncAudio();
  ui.stage.dataset.status = next;
  ui.screen.hidden = next === "playing";
  ui["screen-stats"].hidden = next !== "won" && next !== "lost";
  ui["new-mission"].hidden = next !== "won" && !(next === "paused" && model.deliveries === model.districts.length);
  ui.hud.hidden = next !== "playing";
  ui.waypoint.hidden = true;
  ui["touch-panel"].hidden = next !== "playing";
  ui.pause.disabled = next !== "playing" && next !== "paused";
  setText(ui.pause, next === "paused" ? "Resume" : "Pause");
  if (next !== "playing") ui["dispatch-message"].hidden = true;
}

function updateBest() {
  setText(ui.best, `BEST ${String(best).padStart(4, "0")}`);
}

function startFlight() {
  if (!ready) return;
  prepareAudio();
  if (mode === "won") {
    model.status = "playing";
    model.player.hp = 3;
    model.player.boostCharge = 1;
    setMode("playing");
    return;
  }
  if (mode === "paused") {
    setMode("playing");
    return;
  }
  model = sim.createRun();
  selectedDistrict = model.districts[0].id;
  guidedStep = null;
  nextMapFrame = 0;
  clearInput();
  messageUntil = 0;
  hitUntil = 0;
  ui.stage.removeAttribute("data-hit");
  setMode("playing");
  flightAudio?.cue("begin");
}

function togglePause() {
  if (mode === "paused") {
    startFlight();
  } else if (mode === "playing") {
    clearInput();
    setMode("paused");
    setText(ui["screen-kicker"], "DISPATCH HOLD");
    setText(ui["screen-title"], "Hold position");
    setText(ui["screen-copy"], "Flight suspended at your current position. Resume when ready, courier.");
    setText(ui.play, "Resume flight");
  }
}

function finish() {
  const won = model.status === "won";
  const restored = model.districts.filter(district => district.online).length;
  const recovered = model.cells.filter(cell => cell.collected).length;
  clearInput();
  setMode(model.status);
  setText(ui["screen-kicker"], won ? "DISPATCH CONFIRMED" : "SIGNAL LOST");
  setText(ui["screen-title"], won ? "Grid restored" : "Courier down");
  setText(ui["screen-copy"], won ? "Substation feeds are stable. The harbor is yours to fly." : "We lost your transponder. A new courier is ready when you are.");
  const seconds = Math.floor(model.time);
  setText(ui["report-online"], `${restored}/${model.districts.length}`);
  setText(ui["report-cells"], String(recovered));
  setText(ui["report-time"], `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  setText(ui["report-score"], String(model.score));
  setText(ui.play, won ? "Keep flying" : "Retry mission");
  if (model.score > best) {
    best = model.score;
    try { localStorage.setItem(scoreKey, String(best)); } catch { /* Keep the session score. */ }
    updateBest();
  }
  flightAudio?.cue(model.status);
}

function flightInput() {
  const axis = (positive, negative) => Number(positive.some(key => keys.has(key))) - Number(negative.some(key => keys.has(key)));
  const input = {
    turn: axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]),
    forward: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
    lift: touchLift || axis(["KeyR", "KeyE"], ["KeyF", "KeyQ"]),
    phase: queuedPhase,
    boost: keys.has("KeyX"),
    brake: keys.has("KeyC"),
    jettison: queuedDrop,
  };
  if (pointer) {
    input.turn = Math.max(-1, Math.min(1, (pointer.x - pointer.startX) / 42));
    input.forward = Math.max(-1, Math.min(1, (pointer.startY - pointer.y) / 42));
  }
  queuedPhase = false;
  queuedDrop = false;
  return input;
}

function changeTarget() {
  if (mode !== "playing") return;
  const pending = model.districts.filter(district => !district.online);
  const current = pending.findIndex(district => district.id === selectedDistrict);
  if (pending.length) selectedDistrict = pending[(current + 1) % pending.length].id;
  nextMapFrame = 0;
}

function circuitActive() {
  return model.circuit.status === "ready" || model.circuit.status === "running";
}

function toggleCircuit() {
  if (mode !== "playing") return;
  sim.toggleCircuit(model);
  nextMapFrame = 0;
}

function rangeTo(point) {
  const { player } = model;
  return Math.hypot(point.x - player.x, point.y - player.y, point.z - player.z);
}

function nearest(items, score) {
  return items.reduce((best, candidate) => !best || score(candidate) < score(best) ? candidate : best, null);
}

function guideTo(district) {
  if (!district) return null;
  const { player } = model;
  if (district.locked) {
    const relay = nearest(model.relays.filter(item => item.district === district.id && !item.active), rangeTo);
    return relay ? { point: relay, name: `${phaseNames[relay.phase]} relay`, phase: relay.phase } : null;
  }
  const missing = district.recipe.map((amount, phase) => amount - district.received[phase]);
  const uncovered = missing.map((amount, phase) => Math.max(0, amount - player.cargo[phase]));
  const usefulCargo = missing.some((amount, phase) => amount > 0 && player.cargo[phase] > 0);
  if (uncovered.every(amount => amount === 0) || (player.charge >= sim.cargoCapacity && usefulCargo)) {
    return { point: district, name: "Charging ring" };
  }
  if (player.charge >= sim.cargoCapacity) {
    const phase = player.cargo[player.phase] > 0 ? player.phase : 1 - player.phase;
    return { name: `Cargo full · release a ${phaseNames[phase]} cell`, phase };
  }
  const pickup = nearest(model.cells.filter(cell => !cell.collected && uncovered[cell.phase] > 0),
    cell => rangeTo(cell) + (cell.phase === player.phase ? 0 : 6));
  return pickup ? { point: pickup, name: `${phaseNames[pickup.phase]} cell`, phase: pickup.phase }
    : usefulCargo ? { point: district, name: "Charging ring" } : null;
}

function routeText(step) {
  if (!step) return "";
  if (!step.point) return step.name;
  const { player } = model;
  const height = Math.round(step.point.y - player.y);
  const dx = step.point.x - player.x;
  const dz = step.point.z - player.z;
  const lookAhead = Math.min(1, 8 / (Math.hypot(dx, dz) || 1));
  let roof = 0;
  for (let stepIndex = 1; stepIndex <= 5; stepIndex++) {
    const t = stepIndex / 5 * lookAhead;
    roof = Math.max(roof, sim.roofAt(model.buildings, player.x + dx * t, player.z + dz * t));
  }
  const clearRoof = Math.ceil(roof + .75);
  let vertical = "";
  if (roof && player.y < clearRoof) vertical = ` · clear roof at ${clearRoof} m`;
  else if (!roof && Math.abs(height) > 1) vertical = ` · ${height > 0 ? "climb" : "descend"} ${Math.abs(height)} m`;
  return `${step.name[0].toUpperCase()}${step.name.slice(1)} · ${Math.round(rangeTo(step.point))} m${vertical}`;
}

function drawWaypoint() {
  const step = guidedStep;
  if (mode !== "playing" || !step?.point || !renderer.project) {
    ui.waypoint.hidden = true;
    return;
  }
  const position = renderer.project({ ...step.point, y: step.point.y + 1.35 });
  const { clientWidth: width, clientHeight: height } = ui.world;
  if (position.behind) {
    const dx = step.point.x - model.player.x, dz = step.point.z - model.player.z;
    position.x = width / 2 + (dx * Math.cos(model.player.heading) + dz * Math.sin(model.player.heading)) * 8;
    position.y = height;
  }
  const left = Math.max(24, Math.min(width - 24, position.x));
  const top = Math.max(33, Math.min(height - 70, position.y));
  if (!position.visible && Math.abs(position.x - width / 2) < 15 && Math.abs(position.y - height / 2) < 15) {
    ui.waypoint.hidden = true;
    return;
  }
  const edge = !position.visible || left !== position.x || top !== position.y;
  ui.waypoint.hidden = false;
  ui.waypoint.toggleAttribute("data-edge", edge);
  ui.waypoint.style.setProperty("--target-tone", phaseColors[step.phase] ?? "var(--amber)");
  ui.waypoint.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`;
  const angle = Math.atan2(position.y - height / 2, position.x - width / 2) * 180 / Math.PI + 90;
  ui["waypoint-arrow"].style.transform = edge ? `rotate(${angle}deg)` : "";
  setText(ui["waypoint-arrow"], edge ? "▲" : "◆");
  setText(ui["waypoint-label"], step.name.toUpperCase());
}

function drawMap() {
  if (!mapContext) return;
  const { width, height } = ui.map;
  const { minX, maxX, minZ, maxZ } = sim.bounds;
  const project = (x, z) => [10 + (x - minX) / (maxX - minX) * (width - 20), 9 + (z - minZ) / (maxZ - minZ) * (height - 18)];
  const node = (x, z, radius, tone) => {
    mapContext.fillStyle = tone;
    mapContext.beginPath();
    mapContext.arc(...project(x, z), radius, 0, 2 * Math.PI);
    mapContext.fill();
  };
  mapContext.fillStyle = "#07111d";
  mapContext.fillRect(0, 0, width, height);
  mapContext.strokeStyle = "#e0a66666";
  mapContext.strokeRect(10, 9, width - 20, height - 18);
  mapContext.fillStyle = "#1c2b3a";
  for (const building of model.buildings) {
    for (const { x, z, w, d, bottom } of building.levels) {
      mapContext.fillStyle = bottom > 0 ? "#283b4a" : "#1c2b3a";
      const [x1, z1] = project(x - w / 2, z - d / 2);
      const [x2, z2] = project(x + w / 2, z + d / 2);
      mapContext.fillRect(x1, z1, x2 - x1, z2 - z1);
    }
  }
  if (guidedStep?.point) {
    mapContext.strokeStyle = "#b4d6ea80";
    mapContext.setLineDash([3, 3]);
    mapContext.beginPath();
    mapContext.moveTo(...project(model.player.x, model.player.z));
    mapContext.lineTo(...project(guidedStep.point.x, guidedStep.point.z));
    mapContext.stroke();
    mapContext.setLineDash([]);
  }
  for (const pickup of model.cells) {
    if (!pickup.collected) node(pickup.x, pickup.z, guidedStep?.point === pickup ? 4 : 2, phaseColors[pickup.phase]);
  }
  for (const relay of model.relays) {
    const [x, z] = project(relay.x, relay.z);
    mapContext.strokeStyle = relay.active ? "#87ffc5" : phaseColors[relay.phase];
    mapContext.strokeRect(x - 3, z - 3, 6, 6);
  }
  for (const district of model.districts) {
    if (selectedDistrict === district.id) node(district.x, district.z, 9, "#f0e4d6");
    node(district.x, district.z, 7, district.online ? "#87ffc5" : "#ffcd75");
    mapContext.fillStyle = "#071322";
    mapContext.font = "bold 8px system-ui";
    mapContext.textAlign = "center";
    mapContext.textBaseline = "middle";
    mapContext.fillText(String(district.id), ...project(district.x, district.z));
  }
  if (circuitActive()) {
    for (const gate of sim.circuitGates.slice(model.circuit.next)) {
      const [x, z] = project(gate.x, gate.z);
      const selected = gate.id === model.circuit.next + 1;
      mapContext.strokeStyle = selected ? phaseColors[gate.phase] : "#b4d6ea90";
      const size = selected ? 5 : 2.6;
      mapContext.strokeRect(x - size, z - size, 2 * size, 2 * size);
    }
  }
  mapContext.save();
  mapContext.translate(...project(model.player.x, model.player.z));
  mapContext.rotate(model.player.heading);
  mapContext.fillStyle = "#ffffff";
  mapContext.beginPath();
  mapContext.moveTo(0, -5);
  mapContext.lineTo(4, 4);
  mapContext.lineTo(0, 2);
  mapContext.lineTo(-4, 4);
  mapContext.fill();
  mapContext.restore();
}

function cellList(amounts) {
  return amounts.map((count, phase) => count ? `${count} ${phaseNames[phase]}` : "").filter(Boolean).join(" + ");
}

function updateFlight(now) {
  const { player, districts, event, circuit } = model;
  const restored = districts.filter(district => district.online).length;
  const pending = districts.filter(district => !district.online);
  const destination = pending.find(district => district.id === selectedDistrict) ?? nearest(pending, rangeTo);
  selectedDistrict = destination?.id ?? 0;
  const trial = circuitActive();
  const gate = trial ? sim.circuitGates[circuit.next] : null;
  const goal = destination?.locked ? `Rooftop relays ${model.relays.filter(relay => relay.district === destination.id && relay.active).length} / ${model.relays.filter(relay => relay.district === destination.id).length}`
    : destination ? `Needs ${cellList(destination.recipe.map((amount, phase) => amount - destination.received[phase]))}` : "";
  guidedStep = gate ? { point: gate, phase: gate.phase, name: `${phaseNames[gate.phase]} gate` } : guideTo(destination);
  ui.stage.dataset.phase = String(player.phase);
  setText(ui.charged, trial ? `GATE ${gate.id} / ${sim.circuitGates.length}` : `${restored} / ${districts.length} SUBSTATIONS`);
  setText(ui["sector-name"], trial ? "Harbor time trial" : destination?.name ?? "Grid restored");
  const timer = circuit.status === "ready" ? "Fly through the first gate to start" : `${Math.max(0, circuit.limit - circuit.elapsed).toFixed(1)} s left`;
  setText(ui["sector-goal"], trial ? timer : goal);
  ui["time-trial"].setAttribute("aria-pressed", String(trial));
  ui["next-target"].hidden = trial || !destination;
  setText(ui["time-trial-label"], trial ? "Exit trial" : "Time trial");
  ui["time-trial"].title = trial ? "Exit the time trial (T)" : bestCircuit ? `Time trial (T) · Best ${bestCircuit.toFixed(2)} s` : "Start the time trial (T)";
  setText(ui["route-next"], routeText(guidedStep));
  const { minX, maxX, minZ, maxZ } = sim.bounds;
  const remaining = Math.min(player.x - minX, maxX - player.x, player.z - minZ, maxZ - player.z);
  ui["airspace-warning"].hidden = remaining > 7;
  setText(ui["airspace-warning"], remaining < .15 ? "Airspace limit · Turn back" : "Approaching airspace limit");
  setText(ui["phase-label"], `${phaseNames[player.phase].toUpperCase()} PHASE`);
  setText(ui.integrity, Array.from({ length: 3 }, (_, index) => index < player.hp ? "◆" : "◇").join(" "));
  ui.integrity.setAttribute("aria-label", `Hull integrity ${player.hp} out of 3`);
  setText(ui["cargo-cyan"], `${player.cargo[0]} cyan`);
  setText(ui["cargo-pink"], `${player.cargo[1]} pink`);
  setText(ui.altitude, `${Math.round(player.y)} m`);
  const boost = ui["boost-meter"];
  boost.setAttribute("aria-valuenow", String(Math.round(player.boostCharge * 100)));
  boost.firstElementChild.style.transform = `scaleX(${player.boostCharge})`;
  if (event) {
    const record = event.kind === "circuit-won" && (!bestCircuit || circuit.elapsed < bestCircuit);
    if (record) {
      bestCircuit = circuit.elapsed;
      try { localStorage.setItem(circuitKey, String(bestCircuit)); } catch { /* Keep the session record. */ }
    }
    const station = districts.find(district => district.id === event.district);
    const messages = {
      delivery: "Cell transferred", substation: `${station?.name ?? "Substation"} online${event.repaired ? " · hull repaired" : ""}`,
      hit: "Electrical strike · hull damaged", cell: "Cell recovered", jettison: "Cell returned to its pickup point",
      relay: event.unlocked ? `${station?.name ?? "Substation"} unlocked` : "Rooftop relay online",
      "dock-locked": "Activate the rooftop relays first",
      "dock-missing": `This station needs ${cellList(event.missing ?? [])}`,
      "circuit-won": `Time trial complete · ${circuit.elapsed.toFixed(2)} s${record ? " · New record" : ""}`,
      "circuit-expired": "Time trial expired · Press T to retry",
    };
    if (messages[event.kind]) {
      setText(ui["dispatch-message"], messages[event.kind]);
      messageUntil = now + (event.kind === "cell" ? 900 : event.kind === "circuit-won" ? 4200 : 2300);
    }
    if (event.kind === "hit") hitUntil = now + 260;
    nextMapFrame = 0;
    flightAudio?.cue(event.kind);
  }
  ui["dispatch-message"].hidden = now >= messageUntil;
  ui.stage.toggleAttribute("data-hit", now < hitUntil);
  if (now >= nextMapFrame) {
    drawMap();
    nextMapFrame = now + 80;
  }
}

function attachInput() {
  ui.play.addEventListener("click", startFlight);
  ui["new-mission"].addEventListener("click", () => { setMode("menu"); startFlight(); });
  ui.pause.addEventListener("click", togglePause);
  ui["next-target"].addEventListener("click", changeTarget);
  ui["time-trial"].addEventListener("click", toggleCircuit);
  ui.audio.addEventListener("click", () => {
    sound = !sound;
    ui.audio.setAttribute("aria-pressed", String(sound));
    setText(ui.audio, sound ? "Sound on" : "Sound off");
    if (sound && mode === "playing") prepareAudio();
    syncAudio();
  });
  ui["touch-phase"].addEventListener("click", () => { queuedPhase = true; });
  ui["touch-drop"].addEventListener("click", () => { queuedDrop = true; });
  for (const [button, direction] of [[ui["touch-down"], -1], [ui["touch-up"], 1]]) {
    button.addEventListener("pointerdown", event => {
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      touchLift = direction;
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(name, () => { if (touchLift === direction) touchLift = 0; });
    }
  }
  ui.stage.addEventListener("pointerdown", event => {
    if (mode !== "playing" || event.pointerType === "mouse" || event.target.closest("button, .navigation")) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
    ui.stage.setPointerCapture(event.pointerId);
  });
  ui.stage.addEventListener("pointermove", event => {
    if (pointer?.id === event.pointerId) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    ui.stage.addEventListener(name, event => { if (pointer?.id === event.pointerId) pointer = null; });
  }
  window.addEventListener("keydown", event => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const key = event.code;
    const focusedControl = event.target instanceof Element && event.target.closest("button, a");
    if (flightKeys.has(key) && mode === "playing") {
      event.preventDefault();
      keys.add(key);
      return;
    }
    if (event.repeat) return;
    if (key === "Escape" || key === "KeyP") {
      event.preventDefault();
      togglePause();
    } else if (mode === "playing") {
      if (key === "Space" || key === "ShiftLeft" || key === "ShiftRight") {
        event.preventDefault();
        queuedPhase = true;
      }
      if (key === "KeyV") queuedDrop = true;
      if (key === "KeyM") changeTarget();
      if (key === "KeyT") toggleCircuit();
    } else if ((key === "Enter" || key === "Space") && !focusedControl) {
      event.preventDefault();
      startFlight();
    }
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "playing") togglePause();
    else syncAudio();
  });
}

function createFlatFallback(canvas) {
  const context = canvas.getContext("2d");
  const project = (x, z) => [(x - sim.bounds.minX + 4) / (sim.bounds.maxX - sim.bounds.minX + 8) * canvas.width, (z - sim.bounds.minZ + 4) / (sim.bounds.maxZ - sim.bounds.minZ + 8) * canvas.height];
  function ring(x, z, radius, color) {
    context.strokeStyle = color;
    context.beginPath();
    context.arc(...project(x, z), radius, 0, Math.PI * 2);
    context.stroke();
  }
  return {
    resize() { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; },
    render(state) {
      context.fillStyle = "#091522";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.lineWidth = 2;
      for (const district of state.districts) {
        ring(district.x, district.z, 24, district.online ? "#87ffc5" : "#ffce81");
        context.fillStyle = "#d5e3ec";
        const [x, y] = project(district.x, district.z);
        context.fillText(district.name, x - 20, y - 28);
      }
      for (const item of state.hazards) ring(item.x, item.z, 10, phaseColors[item.phase]);
      for (const item of state.cells) if (!item.collected) ring(item.x, item.z, 5, phaseColors[item.phase]);
      for (const relay of state.relays) {
        const [x, y] = project(relay.x, relay.z);
        context.strokeStyle = relay.active ? "#87ffc5" : phaseColors[relay.phase];
        context.strokeRect(x - 8, y - 8, 16, 16);
      }
      if (state.circuit.status === "ready" || state.circuit.status === "running") {
        const gate = sim.circuitGates[state.circuit.next];
        ring(gate.x, gate.z, 16, phaseColors[gate.phase]);
        context.fillStyle = phaseColors[gate.phase];
        const [x, y] = project(gate.x, gate.z);
        context.fillText(`Gate ${gate.id}`, x + 19, y);
      }
      const { x, z, phase } = state.player;
      const [screenX, screenY] = project(x, z);
      context.fillStyle = phaseColors[phase];
      context.beginPath();
      context.moveTo(screenX, screenY - 13);
      context.lineTo(screenX + 9, screenY + 8);
      context.lineTo(screenX, screenY + 4);
      context.lineTo(screenX - 9, screenY + 8);
      context.fill();
      context.restore();
    },
  };
}

updateBest();
attachInput();

try {
  const { createWorld } = await import("./open-world.js");
  renderer = createWorld(ui.world);
  ui.stage.dataset.renderer = "3d";
} catch (error) {
  console.warn("WebGL renderer unavailable. Using the compatibility renderer.", error);
  const canvas = ui.world.cloneNode();
  ui.world.replaceWith(canvas);
  ui.world = canvas;
  renderer = createFlatFallback(canvas);
  ui.stage.dataset.renderer = "2d";
}
renderer.resize();
new ResizeObserver(() => renderer.resize()).observe(ui.stage);
ready = true;
ui.play.disabled = false;
setText(ui.play, "Launch courier →");

let previousFrame = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(.05, (now - previousFrame) / 1000));
  previousFrame = now;
  let input;
  if (mode === "playing") {
    input = flightInput();
    sim.step(model, input, dt);
    updateFlight(now);
    if (model.status !== "playing") finish();
  }
  renderer.render(model, mode === "paused" ? 0 : dt, mode);
  if (input && mode === "playing" && flightAudio && sound) {
    flightAudio.update(model.player, input, dt, renderer.trafficSources ?? [], renderer.listenerHeading ?? model.player.heading);
  }
  drawWaypoint();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
