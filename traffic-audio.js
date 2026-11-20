const profiles = {
  car: { base: 89, speed: 10.9, overtone: 3.19, motor: .166, harmonics: .027, tyres: .079, colour: 2180 },
  taxi: { base: 118, speed: 12.8, overtone: 2.48, motor: .143, harmonics: .039, tyres: .084, colour: 2480 },
  courier: { base: 72, speed: 9.8, overtone: 2.29, motor: .172, harmonics: .022, tyres: .141, colour: 1930 },
  shuttle: { base: 57, speed: 8.35, overtone: 3.63, motor: .192, harmonics: .025, tyres: .157, colour: 1640 },
};

const maximumVoices = 4;
const releaseTime = .24;
const acousticSpeed = 183;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function limitRange(value, low, high) {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

function wetSurfaceBuffer(context) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2.75), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 8711921;
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const sample = (seed >>> 0) / 2147483648 - 1;
    low = low * .91 + sample * .09;
    samples[i] = sample * .60 + low * .54;
  }
  const seam = 192;
  for (let i = 0; i < seam; i++) {
    const gain = Math.sin(Math.PI * i / (2 * seam));
    samples[i] *= gain;
    samples[samples.length - i - 1] *= gain;
  }
  return buffer;
}

function createVoice(context, destination, buffer, index) {
  const low = context.createOscillator();
  const high = context.createOscillator();
  const noise = context.createBufferSource();
  const rumble = context.createGain();
  const whine = context.createGain();
  const tyres = context.createGain();
  const volume = context.createGain();
  const lowCut = context.createBiquadFilter();
  const highCut = context.createBiquadFilter();
  const panner = context.createStereoPanner?.();

  low.type = 'sine';
  high.type = 'triangle';
  low.frequency.value = 115;
  high.frequency.value = 338;
  noise.buffer = buffer;
  noise.loop = true;
  lowCut.type = 'highpass';
  lowCut.frequency.value = 310;
  lowCut.Q.value = .65;
  highCut.type = 'lowpass';
  highCut.frequency.value = 1900;
  highCut.Q.value = .51;
  volume.gain.value = 0;
  rumble.gain.value = whine.gain.value = tyres.gain.value = 0;

  low.connect(rumble).connect(volume);
  high.connect(whine).connect(volume);
  noise.connect(lowCut).connect(highCut).connect(tyres).connect(volume);
  if (panner) volume.connect(panner).connect(destination);
  else volume.connect(destination);
  low.start();
  high.start();
  noise.start(0, index * .58 % buffer.duration);

  return {
    id: null, retire: 0, volume: volume.gain, pan: panner?.pan,
    frequency: low.frequency, overtones: high.frequency, noiseSpeed: noise.playbackRate,
    rumble: rumble.gain, whine: whine.gain, tyres: tyres.gain,
    rumbleFilter: lowCut.frequency, textureFilter: highCut.frequency,
    dispose() {
      low.stop();
      high.stop();
      noise.stop();
      for (const node of [low, high, noise, rumble, whine, tyres, lowCut, highCut, volume, panner]) node?.disconnect();
    },
  };
}

function audibleSource(listener, source, voice) {
  const profile = profiles[source.kind];
  if (!profile) return null;
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const dz = source.z - listener.z;
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy);
  if (!Number.isFinite(distance) || distance > 56) return null;
  const direction = 1 / Math.max(1, distance);
  const right = dx * Math.cos(listener.heading) + dz * Math.sin(listener.heading);
  const forward = dx * Math.sin(listener.heading) - dz * Math.cos(listener.heading);
  const behind = clamp(-forward / Math.max(1, horizontal), 0, 1);
  const volume = (1 - limitRange(distance, 25, 54)) * (1 - behind * .16) /
    (1 + distance * .103 + (distance / 12) ** 2);
  if (volume < .003) return null;
  const listenerRadial = ((listener.vx || 0) * dx + (listener.vz || 0) * dz) * direction;
  const vehicleRadial = (source.vx * dx + source.vz * dz) * direction;

  return {
    id: source.id, profile, volume, speed: Math.max(0, source.speed),
    pan: .88 * right / Math.max(2.5, horizontal, Math.abs(dy) * .9), distance,
    doppler: clamp((acousticSpeed + listenerRadial) / (acousticSpeed + vehicleRadial), .81, 1.22),
    priority: volume * (voice ? 1.22 : 1),
  };
}

export function createTrafficAudio(context, destination = context.destination) {
  const voices = [];
  let noise;

  function update(listener, sources = []) {
    const now = context.currentTime;
    const nearby = listener && Number.isFinite(listener.heading)
      ? sources.map(source => audibleSource(listener, source, voices.find(voice => voice.id === source.id && !voice.retire)))
        .filter(Boolean).sort((a, b) => b.priority - a.priority).slice(0, maximumVoices)
      : [];

    for (const voice of voices) {
      if (voice.id === null || nearby.some(source => source.id === voice.id)) continue;
      if (!voice.retire) {
        voice.volume.setTargetAtTime(0, now, .047);
        voice.retire = now + releaseTime;
      } else if (voice.retire <= now) {
        voice.id = null;
        voice.retire = 0;
      }
    }

    for (const source of nearby) {
      let voice = voices.find(candidate => candidate.id === source.id);
      if (!voice) {
        voice = voices.find(candidate => candidate.id === null);
        if (!voice && voices.length < maximumVoices) {
          noise ||= wetSurfaceBuffer(context);
          voice = createVoice(context, destination, noise, voices.length);
          voices.push(voice);
        }
        if (!voice) continue;
      }
      const fresh = voice.id !== source.id;
      voice.id = source.id;
      voice.retire = 0;
      const profile = source.profile;
      const motion = limitRange(source.speed, .2, 7.5);
      const speed = source.speed;
      const base = (profile.base + speed * profile.speed) * source.doppler;
      const brightness = 1 - limitRange(source.distance, 5, 37) * .57;
      const target = (param, value, seconds) => {
        if (fresh) param.setValueAtTime(value, now);
        else param.setTargetAtTime(value, now, seconds);
      };
      target(voice.frequency, base, .041);
      target(voice.overtones, base * profile.overtone, .045);
      target(voice.noiseSpeed, source.doppler * (.81 + motion * .29), .079);
      target(voice.rumbleFilter, 350 + 126 * motion, .090);
      target(voice.textureFilter, profile.colour * brightness + 480 * motion, .090);
      target(voice.rumble, profile.motor * (.38 + .62 * motion), .076);
      target(voice.whine, profile.harmonics * brightness * (.30 + .70 * motion), .064);
      target(voice.tyres, profile.tyres * (.044 + .956 * motion), .083);
      if (voice.pan) target(voice.pan, source.pan, .052);
      if (fresh) voice.volume.setValueAtTime(0, now);
      voice.volume.setTargetAtTime(source.volume * .57, now, .062);
    }
  }

  function reset() {
    for (const voice of voices) voice.dispose();
    voices.length = 0;
  }

  return { update, reset };
}
