import { createDroneAudio } from './drone-audio.js';
import { createTrafficAudio } from './traffic-audio.js';

const chimes = {
  begin: [294, 440, 587], phase: [355, 534], cell: [523, 784, 1047],
  hit: [135, 89], delivery: [329, 493, 659], substation: [392, 523, 659, 784],
  relay: [587, 740, 880], jettison: [392, 294],
  'circuit-gate': [659, 880], 'circuit-won': [659, 880, 1047], 'circuit-expired': [330, 294],
  won: [330, 392, 523, 659, 784], lost: [265, 196, 131],
};

function fade(param, value, now, duration) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
  else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  param.linearRampToValueAtTime(value, now + duration);
}

// Independent stereo rain. Small, resonant taps are audible close to the street.
function createRain(context, destination) {
  const rate = 22050;
  const buffer = context.createBuffer(2, rate * 6, rate);
  let seed = 71127;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let side = 0; side < 2; side++) {
    const samples = buffer.getChannelData(side);
    let smooth = 0;
    for (let i = 0; i < samples.length; i++) {
      const white = 2 * random() - 1;
      smooth += .14 * (white - smooth);
      samples[i] = smooth * .65 + white * .09;
    }
    for (let drop = 0; drop < 190; drop++) {
      const start = Math.floor(random() * samples.length);
      const pitch = 650 + random() * 1550;
      const strength = .034 + random() ** 3 * .13;
      for (let i = 0; i < 280; i++) {
        const t = i / rate;
        samples[(start + i) % samples.length] += strength * Math.exp(-t * 335) *
          Math.sin(2 * Math.PI * pitch * (t + 6 * t * t));
      }
    }
  }
  const rain = context.createBufferSource();
  rain.buffer = buffer;
  rain.loop = true;
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 390;
  highpass.Q.value = .6;
  const gain = context.createGain();
  gain.gain.value = .12;
  rain.connect(highpass).connect(gain).connect(destination);
  rain.start();
  return gain.gain;
}

export function createFlightAudio(context) {
  const movingBus = context.createGain();
  movingBus.gain.value = 0;
  const cueBus = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -13;
  limiter.knee.value = 11;
  limiter.ratio.value = 3;
  limiter.attack.value = .009;
  limiter.release.value = .18;
  const master = context.createGain();
  master.gain.value = 0;
  movingBus.connect(limiter);
  cueBus.connect(limiter);
  limiter.connect(master).connect(context.destination);
  const motor = createDroneAudio(context, movingBus);
  const traffic = createTrafficAudio(context, movingBus);
  const rain = createRain(context, movingBus);
  const notes = new Set();
  const listener = {};
  let canHear = false;
  let isFlying = false;
  let suspendTimer;
  let lastRainCheck = -Infinity;

  function setState(enabled, mode) {
    clearTimeout(suspendTimer);
    const now = context.currentTime;
    const moving = enabled && mode === 'playing';
    const endScreen = enabled && (mode === 'won' || mode === 'lost');
    canHear = moving || endScreen;
    fade(master.gain, canHear ? .90 : 0, now, .024);
    if (isFlying !== moving) {
      fade(movingBus.gain, moving ? 1 : 0, now, moving ? .09 : .04);
      if (!moving) {
        motor.reset();
        traffic.reset();
      }
      lastRainCheck = -Infinity;
    }
    isFlying = moving;
    if (!canHear) {
      for (const note of notes) note.stop(now + .028);
    }
    // Let the win / loss phrase finish, then put the continuous generators to sleep.
    if (!moving && context.state !== 'closed') {
      suspendTimer = setTimeout(() => {
        context.suspend().then(() => {
          // A restart can arrive while the audio device is still processing a suspend.
          if (isFlying && context.state === 'suspended') return context.resume();
        }).catch(() => {});
      }, endScreen ? 850 : 75);
    }
  }

  function cue(kind) {
    if (!canHear || !Object.hasOwn(chimes, kind)) return;
    const hit = kind === 'hit';
    for (const [index, frequency] of chimes[kind].entries()) {
      const start = context.currentTime + index * .062;
      const tone = context.createOscillator();
      const envelope = context.createGain();
      tone.type = hit ? 'sawtooth' : 'sine';
      tone.frequency.value = frequency;
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(hit ? .035 : .068, start + .013);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + .192);
      tone.connect(envelope).connect(cueBus);
      notes.add(tone);
      tone.onended = () => {
        notes.delete(tone);
        tone.disconnect();
        envelope.disconnect();
      };
      tone.start(start);
      tone.stop(start + .2);
    }
  }

  function update(player, input, dt, sources, heading) {
    if (!isFlying || context.state !== 'running' || dt <= 0) return;
    motor.update(player, input, dt);
    Object.assign(listener, {x:player.x, y:player.y, z:player.z, vx:player.vx, vz:player.vz, heading});
    traffic.update(listener, sources);
    if (context.currentTime - lastRainCheck >= .15) {
      lastRainCheck = context.currentTime;
      const aboveStreet = Math.min(1, Math.max(0, (player.y - 3) / 25));
      rain.setTargetAtTime(.17 - .12 * aboveStreet, lastRainCheck, .42);
    }
  }
  return {setState, cue, update};
}
