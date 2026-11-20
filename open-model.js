"use strict";

(() => {
  const bounds = Object.freeze({ minX: -52, maxX: 140, minY: 2, maxY: 52, minZ: -52, maxZ: 140 });
  const cargoCapacity = 4;
  const droneRadius = 0.65;
  const cruiseSpeed = 12;
  const boostSpeed = 21;
  const liftSpeed = 8;
  const steerResponse = 10;
  const coastResponse = 5.5;
  const brakeResponse = 28;
  const boostDrain = 0.55;
  const boostRecharge = 0.31;
  const hitCooldown = 1.5;
  const maxTick = 1 / 90;
  const circuitLimit = 120;

  const circuitGates = [
    [-2, 5.3, 19, 0], [11, 8.6, 9, 1], [5, 11.7, -3, 0], [4, 13.7, -21, 1],
    [21, 8.9, -30, 0], [33, 10.6, -18, 1], [7, 6.0, -7, 0],
    [49, 15, 12, 1], [66, 4.5, 12, 0], [89, 9, 13, 1], [117, 43, -24, 0],
    [89, 17, 52, 1], [120, 19, 65, 0], [110, 46, 103, 1], [72, 12, 87, 0],
    [36, 25, 113, 1], [15, 28, 126, 0], [-10, 7, 87, 1], [-10, 5.5, 61, 0], [0, 7, 29, 1],
  ].map(([x, y, z, phase], index, route) => {
    const [approachX, , approachZ] = route[index - 1] ?? [0, 7, 26];
    const bearing = Math.atan2(approachX - x, approachZ - z);
    return { x, y, z, phase, bearing, id: index + 1, radius: 2.2 };
  });

  const stations = [
    { id: 1, name: "Docklands", x: -28, y: 5, z: -22, radius: 3.25, recipe: [1, 1] },
    { id: 2, name: "Crosswind", x: 0, y: 6, z: -4, radius: 3.25, recipe: [2, 0] },
    { id: 3, name: "Central Core", x: 28, y: 6, z: -26, radius: 3.25, recipe: [1, 1] },
  ];

  const rooftopRelays = [
    { id: 1, x: 3, y: 12, z: -24, radius: 2.7, phase: 0, district: 3 },
    { id: 2, x: 45, y: 27.5, z: -28, radius: 2.7, phase: 1, district: 3 },
  ];

  // [x, y, z, phase, district]. Cargo can power any substation.
  const powerCells = [
    [-21, 6, -11, 0, 1], [-33, 8, -14, 1, 1], [-36, 5, -29, 0, 1], [-22, 11, -33, 1, 1],
    [-10, 6, 8, 0, 2], [8, 8, 9, 1, 2], [-6, 8, -11, 1, 2], [7, 10, -12, 0, 2],
    [21, 5, -15, 0, 3], [36, 8, -22, 1, 3], [18, 11, -33, 1, 3], [34, 6, -39, 0, 3],
  ];

  // Orbiters patrol open air near approaches. [centerX, centerY, centerZ, orbit, rate, start, phase].
  const patrols = [
    [-14, 5.8, 4, 5.5, 0.59, 1.3, 1], [10, 8, 3, 5, -0.7, 2.1, 0],
    [-23, 6.3, -17, 7.3, 0.65, 1.9, 0], [-36, 7.4, -23, 5.1, -0.9, 0.1, 1],
    [23, 5.6, -20, 7.1, -0.7, 2.8, 1], [34, 7.4, -29, 6.2, 0.83, 0.5, 0],
    [3, 10.4, -15, 8.4, -0.55, 1.8, 1], [24, 11.3, -37, 5.4, 0.95, 3.2, 0],
  ];

  // [centerX, centerZ, width, depth, roofHeight, profile, podiumHeight].
  const blocks = [
    [-39, 25, 13, 10, 16, "terraces", 8],
    [-23, 27, 8, 12, 22, "tower", 11],
    [-11, 35, 10, 9, 25, "wing", 9],
    [14, 31, 9, 12, 29, "tower", 10],
    [26, 27, 11, 10, 16, "wing", 8],
    [42, 30, 10, 8, 24, "terraces", 11],
    [-39, 8, 11, 12, 19, "wing", 10],
    [-26, 5, 8, 8, 18, "tower", 9],
    [-15, 17, 9, 7, 26, "terraces", 10],
    [18, 17, 10, 9, 25, "terraces", 9],
    [29, 7, 9, 13, 32, "twin", 12],
    [42, 10, 11, 11, 23, "wing", 10],
    [-43, -12, 8, 10, 27, "terraces", 11],
    [-14, -9, 8, 10, 24, "tower", 8],
    [12, -8, 5, 7, 21, "slab"],
    [38, -9, 11, 10, 17, "wing", 7],
    [-45, -30, 7, 9, 22, "tower", 10],
    [-13, -25, 6, 10, 30, "terraces", 12],
    [3, -24, 9, 10, 9, "slab"],
    [10, -38, 8, 10, 28, "tower", 11],
    [45, -28, 7, 12, 25, "terraces", 11],
    [-39, -42, 11, 9, 15, "wing", 7],
    [-24, -45, 10, 7, 23, "terraces", 9],
    [-4, -42, 10, 8, 35, "twin", 12],
    [22, -46, 8, 6, 20, "wing", 8],
    [43, -43, 8, 8, 19, "tower", 9],
    // Narrow frontage plots fill in the market streets and leave service alleys between blocks.
    [-11.3, 25.4, 7.4, 5.4, 17, "terraces", 8],
    [8.6, 22.7, 5.1, 2.6, 11, "slab"],
    [10.2, 3.0, 4.2, 4.5, 18, "tower", 8],
    [-20.0, 6.7, 3.0, 6.6, 13, "slab"],
    [-19.2, -2.1, 5.3, 4.2, 17, "wing", 8],
    [20.5, 4.0, 4.6, 8.8, 19, "terraces", 9],
    [38.6, 21.6, 7.8, 5.4, 16, "tower", 9],
    [33.0, 32.1, 4.2, 6.9, 13, "slab"],
    [-23.2, 15.4, 5.6, 6.5, 12, "terraces", 7],
    [-39.5, 17.7, 8.0, 3.9, 14, "wing", 7],
    [-40.5, -3.4, 7.1, 4.5, 13, "tower", 6],
    [43.0, -.8, 5.8, 4.5, 15, "wing", 8],
    [24.5, -6.0, 7.1, 7.4, 18, "terraces", 9],
    [-25.7, -7.6, 5.6, 8.5, 12, "wing", 6],
    [-4.8, -26.1, 3.6, 6.7, 17, "slab"],
    [16.9, -23.1, 5.7, 7.9, 19, "tower", 8],
    [-28.0, -34.8, 5.7, 6.8, 14, "terraces", 7],
    [-12.4, -37.1, 4.8, 7.3, 15, "slab"],
    [27.2, -36.0, 6.6, 6.6, 20, "wing", 8],
    [17.7, 40.4, 6.0, 4.5, 12, "slab"],
  ];

  // Walkway envelopes match the decks and canopy volumes used by the renderer.
  const skybridges = Object.freeze([
    Object.freeze({ name: "Night Market Walkway", x: -1.405, z: 23.43, w: 15.25, d: 1.23,
      bottom: 9.02, h: 10.98, axis: "x", tint: 0xffad6c }),
    Object.freeze({ name: "Crosswind Exchange", x: -.90, z: -8.90, w: 21.35, d: 1.95,
      bottom: 14.45, h: 16.85, axis: "x", tint: 0xbab2ff }),
    Object.freeze({ name: "Core Service Link", x: 38.175, z: -1.22, w: 1.75, d: 12.65,
      bottom: 11.30, h: 13.72, axis: "z", tint: 0x80e4de }),
  ]);

  function buildingFrom([x, z, w, d, h, profile, streetHeight = h]) {
    const levels = [{ x, z, w, d, bottom: 0, h: streetHeight }];
    if (profile === "wing") {
      levels[0] = { x: x - w * .08, z, w: w * .84, d, bottom: 0, h: streetHeight };
      levels.push({ x: x + w * .42, z: z + d * .21, w: w * .16, d: d * .58, bottom: 0, h: streetHeight * .72 });
      levels.push({ x: x - w * .12, z: z - d * .15, w: w * .62, d: d * .63, bottom: streetHeight, h });
    } else if (profile === "tower") {
      levels.push({ x: x + w * .07, z: z - d * .08, w: w * .52, d: d * .66, bottom: streetHeight, h });
    } else if (profile === "terraces") {
      const middle = streetHeight + (h - streetHeight) * .58;
      levels.push({ x: x - w * .06, z: z - d * .06, w: w * .79, d: d * .77, bottom: streetHeight, h: middle });
      levels.push({ x: x - w * .12, z: z - d * .12, w: w * .59, d: d * .55, bottom: middle, h });
    } else if (profile === "twin") {
      levels.push({ x: x - w * .27, z: z + d * .08, w: w * .29, d: d * .7, bottom: streetHeight,
        h: streetHeight + (h - streetHeight) * .64 });
      levels.push({ x: x + w * .27, z: z - d * .12, w: w * .34, d: d * .67, bottom: streetHeight, h });
    }
    return { x, z, w, d, h, streetHeight, levels };
  }

  const outer = window.GridOuterDistricts;
  blocks.push(...outer.blocks);
  stations.push(...outer.stations);
  powerCells.push(...outer.cells);
  rooftopRelays.push(...outer.relays);
  patrols.push(...outer.patrols);
  const cityBuildings = blocks.map(buildingFrom);

  function updatePatrol(hazard, time) {
    const [x, y, z, orbit, rate, start] = patrols[hazard.id - 1];
    const angle = start + time * rate;
    hazard.x = x + Math.cos(angle) * orbit;
    hazard.y = y + Math.sin(angle * 0.85 + start) * 1.6;
    hazard.z = z + Math.sin(angle) * orbit * 0.85;
    return hazard;
  }

  function createRun() {
    return {
      player: {
        x: 0, y: 7, z: 26, phase: 0, hp: 3, charge: 0, cargo: [0, 0],
        boostCharge: 1, boosting: false, invulnerable: 0, heading: 0, vx: 0, vz: 0, braking: false,
      },
      districts: stations.map(station => ({
        ...station, recipe: [...station.recipe], received: [0, 0],
        needed: station.recipe[0] + station.recipe[1], delivered: 0, online: false,
        locked: rooftopRelays.some(relay => relay.district === station.id),
      })),
      relays: rooftopRelays.map(relay => ({ ...relay, active: false })),
      cells: powerCells.map(([x, y, z, phase, district], i) => ({ id: i + 1, x, y, z, phase, collected: false, district })),
      hazards: patrols.map((patrol, i) => updatePatrol({ id: i + 1, phase: patrol[6], radius: 1.65 }, 0)),
      buildings: cityBuildings,
      bridges: skybridges,
      time: 0, score: 0, status: "playing", event: null, phaseFlash: 0,
      totalCells: 0, deliveries: 0, nextEventId: 1, dockNotice: null,
      cargoSources: [[], []],
      circuit: { status: "idle", next: 0, elapsed: 0, limit: circuitLimit },
    };
  }

  function emit(state, kind, details) {
    state.event = { kind, id: state.nextEventId++, ...details };
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function axis(value) {
    return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
  }

  function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
  }

  function roofAt(buildings, x, z) {
    let height = 0;
    for (const building of buildings) {
      if (Math.abs(x - building.x) >= building.w / 2 + droneRadius ||
          Math.abs(z - building.z) >= building.d / 2 + droneRadius) continue;
      for (const level of building.levels || [building]) {
        if (Math.abs(x - level.x) < level.w / 2 + droneRadius &&
            Math.abs(z - level.z) < level.d / 2 + droneRadius) height = Math.max(height, level.h);
      }
    }
    return height;
  }

  function intersectsCity(state, x, y, z) {
    if (y - droneRadius < roofAt(state.buildings, x, z)) return true;
    for (const bridge of state.bridges) {
      if (y + droneRadius > bridge.bottom && y - droneRadius < bridge.h &&
          Math.abs(x - bridge.x) < bridge.w / 2 + droneRadius &&
          Math.abs(z - bridge.z) < bridge.d / 2 + droneRadius) return true;
    }
    return false;
  }

  function perimeterThrottle(position, direction, min, max) {
    const remaining = direction > 0 ? max - position : position - min;
    return clamp(remaining / 4, .22, 1);
  }

  function fly(state, x, z, lift, boost, brake, dt, turn) {
    const player = state.player;
    if (turn !== null) {
      player.heading += turn * 1.98 * dt;
      player.heading = Math.atan2(Math.sin(player.heading), Math.cos(player.heading));
      const throttle = z;
      x = Math.sin(player.heading) * throttle;
      z = -Math.cos(player.heading) * throttle;
    }
    const boostTime = boost && !brake && (x !== 0 || z !== 0 || lift !== 0)
      ? Math.min(dt, player.boostCharge / boostDrain) : 0;
    const targetSpeed = cruiseSpeed + (boostSpeed - cruiseSpeed) * boostTime / dt;
    const climb = liftSpeed * (dt + 0.35 * boostTime);
    player.boosting = boostTime > 0;
    player.braking = brake;
    player.boostCharge = boost
      ? Math.max(0, player.boostCharge - boostTime * boostDrain)
      : Math.min(1, player.boostCharge + boostRecharge * dt);

    const response = brake ? brakeResponse : (x === 0 && z === 0 ? coastResponse : steerResponse);
    const blend = 1 - Math.exp(-response * dt);
    const speedX = brake ? 0 : x * targetSpeed * perimeterThrottle(player.x, x, bounds.minX, bounds.maxX);
    const speedZ = brake ? 0 : z * targetSpeed * perimeterThrottle(player.z, z, bounds.minZ, bounds.maxZ);
    player.vx += (speedX - player.vx) * blend;
    player.vz += (speedZ - player.vz) * blend;
    if (turn === null && Math.hypot(player.vx, player.vz) > 0.15) player.heading = Math.atan2(player.vx, -player.vz);

    const nextY = clamp(player.y + lift * climb, bounds.minY, bounds.maxY);
    if (!intersectsCity(state, player.x, nextY, player.z)) player.y = nextY;
    const nextX = clamp(player.x + player.vx * dt, bounds.minX, bounds.maxX);
    if (!intersectsCity(state, nextX, player.y, player.z)) player.x = nextX;
    else player.vx = 0;
    const nextZ = clamp(player.z + player.vz * dt, bounds.minZ, bounds.maxZ);
    if (!intersectsCity(state, player.x, player.y, nextZ)) player.z = nextZ;
    else player.vz = 0;
  }

  function jettison(state) {
    const { player } = state;
    const source = state.cargoSources[player.phase].pop();
    if (source === undefined) return;
    const cell = state.cells[source - 1];
    cell.collected = false;
    cell.recoverAfter = state.time + 1;
    player.cargo[player.phase]--;
    player.charge--;
    emit(state, "jettison", { cell: cell.id, phase: player.phase });
  }

  function visitRelays(state) {
    const { player } = state;
    for (const relay of state.relays) {
      if (relay.active || relay.phase !== player.phase || distanceSquared(player, relay) > relay.radius ** 2) continue;
      relay.active = true;
      const district = state.districts.find(item => item.id === relay.district);
      district.locked = state.relays.some(item => item.district === district.id && !item.active);
      emit(state, "relay", { district: district.id, relay: relay.id, unlocked: !district.locked });
    }
  }

  function dockAtStation(state) {
    const { player } = state;
    const district = state.districts.find(item => !item.online && distanceSquared(player, item) <= item.radius ** 2);
    if (!district) {
      state.dockNotice = null;
      return;
    }
    const missing = district.recipe.map((needed, phase) => needed - district.received[phase]);
    const unload = missing.map((amount, phase) => Math.min(amount, player.cargo[phase]));
    const amount = unload[0] + unload[1];
    if (district.locked || amount === 0) {
      const kind = district.locked ? "dock-locked" : "dock-missing";
      if (state.dockNotice !== `${district.id}:${kind}`) {
        state.dockNotice = `${district.id}:${kind}`;
        emit(state, kind, { district: district.id, missing });
      }
      return;
    }

    for (const phase of [0, 1]) {
      player.cargo[phase] -= unload[phase];
      district.received[phase] += unload[phase];
      state.cargoSources[phase].splice(0, unload[phase]);
      missing[phase] -= unload[phase];
    }
    player.charge -= amount;
    district.delivered += amount;
    district.online = district.delivered === district.needed;
    state.dockNotice = `${district.id}:dock-missing`;
    if (district.online) {
      const repaired = player.hp < 3;
      player.hp = Math.min(3, player.hp + 1);
      state.deliveries++;
      state.score += 250;
      emit(state, "substation", { district: district.id, amount, repaired });
      if (state.deliveries === state.districts.length) {
        state.status = "won";
        player.boosting = false;
      }
    } else {
      emit(state, "delivery", { district: district.id, amount, missing });
    }
  }

  function toggleCircuit(state) {
    const wasFlying = state.circuit.status === "running" || state.circuit.status === "ready";
    state.circuit = { status: wasFlying ? "idle" : "ready", next: 0, elapsed: 0, limit: circuitLimit };
  }

  function advanceCircuit(state, dt) {
    const { circuit, player } = state;
    if (circuit.status === "running") {
      circuit.elapsed += dt;
      if (circuit.elapsed >= circuit.limit) {
        circuit.status = "expired";
        emit(state, "circuit-expired");
        return;
      }
    } else if (circuit.status !== "ready") return;
    const gate = circuitGates[circuit.next];
    const depth = (player.x - gate.x) * Math.sin(gate.bearing) + (player.z - gate.z) * Math.cos(gate.bearing);
    if (player.phase !== gate.phase || Math.abs(depth) > .66 || distanceSquared(player, gate) > gate.radius ** 2) return;

    circuit.next++;
    circuit.status = circuit.next === circuitGates.length ? "won" : "running";
    emit(state, circuit.status === "won" ? "circuit-won" : "circuit-gate");
  }

  function tick(state, x, z, lift, boost, brake, dt, turn) {
    const player = state.player;
    state.time += dt;
    state.phaseFlash = Math.max(0, state.phaseFlash - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    fly(state, x, z, lift, boost, brake, dt, turn);

    for (const hazard of state.hazards) updatePatrol(hazard, state.time);
    if (player.invulnerable === 0 && state.hazards.some(hazard =>
      player.phase !== hazard.phase && distanceSquared(player, hazard) <= (hazard.radius + droneRadius) ** 2
    )) {
      player.hp--;
      player.invulnerable = hitCooldown;
      emit(state, "hit");
      if (player.hp <= 0) {
        state.status = "lost";
        player.boosting = false;
        return;
      }
    }

    for (const cell of state.cells) {
      if (player.charge === cargoCapacity) break;
      if (cell.collected || cell.recoverAfter > state.time || player.phase !== cell.phase || distanceSquared(player, cell) > 1.8 ** 2) continue;
      cell.collected = true;
      player.charge++;
      player.cargo[cell.phase]++;
      state.cargoSources[cell.phase].push(cell.id);
      if (!cell.scored) {
        cell.scored = true;
        state.totalCells++;
        state.score += 100;
      }
      emit(state, "cell", { district: cell.district, cell: cell.id, phase: cell.phase });
    }

    visitRelays(state);
    dockAtStation(state);
    if (state.status === "playing") advanceCircuit(state, dt);
  }

  function step(state, input = {}, dt = 0) {
    state.event = null;
    if (state.status !== "playing") return state;
    if (input.phase) {
      state.player.phase = 1 - state.player.phase;
      state.phaseFlash = 0.32;
      emit(state, "phase");
    }
    if (input.jettison) jettison(state);
    const turn = Number.isFinite(input.turn) ? axis(input.turn) : null;
    const x = turn === null ? axis(input.x) : 0;
    const z = turn === null ? axis(input.z) : axis(input.forward);
    const lift = axis(input.lift);
    const length = Math.max(1, Math.hypot(x, z));
    let remaining = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
    while (remaining > 1e-8 && state.status === "playing") {
      const amount = Math.min(remaining, maxTick);
      tick(state, x / length, z / length, lift, Boolean(input.boost), Boolean(input.brake), amount, turn);
      remaining -= amount;
    }
    return state;
  }

  window.GridOpenWorld = { bounds, cargoCapacity, circuitGates, skybridges, createRun, roofAt, step, toggleCircuit };
})();
