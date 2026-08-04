let audioContext: AudioContext | null = null;
let soundUnavailable = false;

function getAudioContext(): AudioContext | null {
  if (soundUnavailable || typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    soundUnavailable = true;
    return null;
  }

  try {
    audioContext ??= new AudioContextClass();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  } catch {
    soundUnavailable = true;
    return null;
  }
}

function tone(frequency: number, start: number, duration: number, type: OscillatorType, volume = 0.045) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.72), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noiseBurst(start: number, duration: number, volume = 0.028) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const samples = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let idx = 0; idx < samples; idx += 1) {
    data[idx] = (Math.random() * 2 - 1) * (1 - idx / samples);
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1400;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + duration);
}

export function playClickSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(520, now, 0.045, 'triangle', 0.035);
}

export function playCloseSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(440, now, 0.055, 'triangle', 0.032);
  tone(330, now + 0.035, 0.065, 'sine', 0.026);
}

export function playSuccessSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(now, 0.12);
  tone(523.25, now, 0.09, 'sine', 0.04);
  tone(659.25, now + 0.08, 0.1, 'sine', 0.04);
  tone(783.99, now + 0.16, 0.14, 'sine', 0.045);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
