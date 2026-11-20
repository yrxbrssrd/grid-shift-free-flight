const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => Number.isFinite(value) ? value : 0;

function approach(current, target, dt, rise, fall) {
  return current + (target - current) * (1 - Math.exp(-dt / (target > current ? rise : fall)));
}

function airBuffer(context) {
  const rate = context.sampleRate;
  const length = Math.ceil(rate * 3.7);
  const overlap = Math.ceil(rate * .048);
  const noise = new Float32Array(length + overlap);
  let seed = 0x729ac6f1;
  let gust = 0;
  let pressure = 0;
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    gust += (white - gust) * .108;
    pressure += (white - pressure) * .012;
    noise[i] = .46 * white + .64 * gust + .53 * pressure;
  }
  const buffer = context.createBuffer(1, length, rate);
  const samples = buffer.getChannelData(0);
  samples.set(noise.subarray(0, length));
  for (let i = 0; i < overlap; i++) {
    const mix = .5 - .5 * Math.cos(i / overlap * Math.PI);
    samples[i] = noise[length + i] * (1 - mix) + noise[i] * mix;
  }
  return buffer;
}

function tone(context, destination, wave, frequency, strength, offset = 0) {
  const source = context.createOscillator();
  const level = context.createGain();
  source.setPeriodicWave(wave);
  source.frequency.value = frequency;
  level.gain.value = strength;
  source.connect(level);
  const pan = offset && typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  if (pan) {
    pan.pan.value = offset;
    level.connect(pan).connect(destination);
  } else level.connect(destination);
  source.start();
  return { pitch: source.frequency, gain: level.gain, pan: pan?.pan };
}

function breath(context, source, destination, frequency, q, strength) {
  const filter = context.createBiquadFilter();
  const level = context.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;
  level.gain.value = strength;
  source.connect(filter).connect(level).connect(destination);
  return { pitch: filter.frequency, gain: level.gain };
}

function harmonics(context, partials) {
  return context.createPeriodicWave(new Float32Array(partials.length), new Float32Array(partials));
}

export function createDroneAudio(context, destination) {
  const output = context.createBiquadFilter();
  output.type = 'highpass';
  output.frequency.value = 53;
  output.Q.value = .56;
  output.connect(destination);

  const fanWave = harmonics(context, [0, 1, .25, .19, .09, .064, .026]);
  const fieldWave = harmonics(context, [0, 1, .14, .03]);
  const left = tone(context, output, fanWave, 79, .019, -.27);
  const right = tone(context, output, fanWave, 81.3, .017, .27);
  const turbine = tone(context, output, fieldWave, 229, .0023);
  const noise = context.createBufferSource();
  noise.buffer = airBuffer(context);
  noise.loop = true;
  const fanBreath = breath(context, noise, output, 282, .78, .052);
  const wind = breath(context, noise, output, 595, .55, .007);
  const exhaust = breath(context, noise, output, 810, .72, 0);
  noise.start();

  const flutter = context.createOscillator();
  const flutterDepth = context.createGain();
  flutter.frequency.value = 8.2;
  flutterDepth.gain.value = .006;
  flutter.connect(flutterDepth).connect(fanBreath.gain);
  flutter.start();

  const targets = new WeakMap();
  let now = context.currentTime;
  let previous = null;
  let drive = 0;
  let airflow = 0;
  let impulse = 0;
  let climb = 0;
  let sink = 0;
  let boost = 0;
  let braking = 0;
  let turn = 0;

  function slide(parameter, value, seconds, epsilon) {
    if (!parameter || Math.abs((targets.get(parameter) ?? parameter.value) - value) < epsilon) return;
    targets.set(parameter, value);
    parameter.setTargetAtTime(value, now, seconds);
  }

  function apply(openness) {
    const rpm = 79 + drive * 57 + climb * 12 - sink * 7 + boost * 13 - braking * 15;
    slide(left.pitch, rpm + turn * 3.4, .075, .22);
    slide(right.pitch, rpm * 1.019 + .80 - turn * 3.2, .081, .22);
    slide(left.gain, .019 + drive * .019 + impulse * .009 + turn * .0035, .075, .00045);
    slide(right.gain, .017 + drive * .020 + impulse * .009 - turn * .0035, .081, .00045);
    slide(left.pan, -.27 + turn * .07, .12, .006);
    slide(right.pan, .27 + turn * .07, .12, .006);

    slide(fanBreath.pitch, 282 + drive * 214 + climb * 62 + boost * 71, .13, 2.1);
    slide(fanBreath.gain, .052 + drive * .043 + impulse * .020, .095, .0010);
    slide(flutter.frequency, 8.2 + drive * 5.8, .18, .11);
    slide(flutterDepth.gain, .006 + impulse * .006 + drive * .006, .10, .0006);
    slide(wind.pitch, 595 + airflow * 878 + openness * 260 + sink * 135, .17, 4.5);
    slide(wind.gain, .007 + Math.pow(airflow, 1.27) * .202 + sink * .024, .12, .0012);

    slide(turbine.pitch, 229 + drive * 90 + climb * 43 + boost * 126 - braking * 63, .15, .9);
    slide(turbine.gain, .0023 + drive * .010 + boost * .023 + braking * .0045, .093, .00048);
    slide(exhaust.pitch, 810 + boost * 355 - braking * 245, .12, 4.2);
    slide(exhaust.gain, boost * .12 + braking * .090, .095, .0012);
  }

  function update(player, input, dt) {
    if (!player || !Number.isFinite(dt) || dt <= 0) return;
    const frame = Math.min(.10, dt);
    const speed = Math.hypot(finite(player.vx), finite(player.vz));
    const altitude = finite(player.y);
    const direction = finite(player.heading);
    const acceleration = previous ? (speed - previous.speed) / frame : 0;
    const elevationRate = previous ? clamp((altitude - previous.altitude) / frame, -12, 12) : 0;
    const headingDelta = previous ? direction - previous.direction : 0;
    const yawRate = Math.atan2(Math.sin(headingDelta), Math.cos(headingDelta)) / frame;
    const throttle = clamp(Math.abs(finite(input?.forward)), 0, 1);
    const upward = clamp(elevationRate / 8, 0, 1);
    const downward = clamp(-elevationRate / 8, 0, 1);
    const accelerationLoad = clamp(acceleration / 55, 0, 1);
    const brakeRequested = player.braking || input?.brake;
    const slowdown = clamp(-acceleration / 61, 0, 1);
    const brakingLoad = brakeRequested
      ? Math.max(slowdown, clamp(speed / 16, 0, 1) * .57) : slowdown * .31;
    const injecting = Number(Boolean(player.boosting));
    const requestLift = clamp(finite(input?.lift), 0, 1);
    const work = clamp(speed / 20 * .67 + throttle * .19 + upward * .23 + requestLift * .045 +
      injecting * .26 + accelerationLoad * .20, 0, 1.34);

    drive = approach(drive, work, frame, .155, .28);
    airflow = approach(airflow, clamp(Math.hypot(speed, elevationRate * .64) / 20, 0, 1.1), frame, .12, .21);
    impulse = approach(impulse, accelerationLoad, frame, .064, .19);
    climb = approach(climb, upward, frame, .12, .20);
    sink = approach(sink, downward, frame, .13, .22);
    boost = approach(boost, injecting, frame, .125, .24);
    braking = approach(braking, brakingLoad, frame, .05, .235);
    turn = approach(turn, clamp(yawRate / 2.5 + finite(input?.turn) * .22, -1, 1), frame, .11, .17);
    previous = { speed, altitude, direction };
    now = context.currentTime;
    apply(clamp((altitude - 3) / 47, 0, 1));
  }

  function reset() {
    previous = null;
    drive = airflow = impulse = climb = sink = boost = braking = turn = 0;
    now = context.currentTime;
    apply(0);
  }

  return { update, reset };
}
