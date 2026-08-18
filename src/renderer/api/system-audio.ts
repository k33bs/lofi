/* eslint-disable no-console */

// macOS system audio for the visualizations. The native volume module needs a
// helper daemon that was never shipped on macOS, so it always reads 0 there;
// Chromium's loopback capture (served by the display media handler in the main
// process) provides the signal instead. Windows keeps the native module and
// this file stays inert off macOS.

let analyser: AnalyserNode | null = null;
let sampleBuffer: Uint8Array<ArrayBuffer> | null = null;
let initInFlight = false;

export const initSystemAudio = (): void => {
  if (process.platform !== 'darwin' || analyser || initInFlight) {
    return;
  }
  initInFlight = true;

  (async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

      // the video track is mandatory in the API but unused, and keeping it
      // around causes capture bugs
      stream.getVideoTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });

      if (!stream.getAudioTracks().length) {
        console.warn('Loopback stream has no audio track, visualizations stay silent.');
        return;
      }

      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const node = context.createAnalyser();
      // 2048 gives ~23Hz bins at 48kHz, enough resolution for the bass band
      node.fftSize = 2048;
      // raw frames; the short/long averages below do all the smoothing
      node.smoothingTimeConstant = 0;
      // the defaults (-100..-30) clip loud music to the byte ceiling, which
      // flattens every beat before any downstream processing sees it
      node.minDecibels = -80;
      node.maxDecibels = -10;
      source.connect(node);

      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      configureBands(context.sampleRate, node.fftSize);
      sampleBuffer = new Uint8Array(node.frequencyBinCount);
      analyser = node;
      // fixed-rate DSP clock: the rhythm must not depend on how many
      // components read the value or how fast they render
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      setInterval(processFrame, 1000 / 60);
      // debug hook for inspecting the live amplitude from devtools
      // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/no-use-before-define
      (window as unknown as Record<string, unknown>).__getSystemVolume = getSystemVolume;
      console.log('System audio capture active.');
    } catch (error) {
      // e.g. permission denied or missing user activation; the next
      // visualization toggle retries
      console.error('System audio capture unavailable:', error);
    } finally {
      initInFlight = false;
    }
  })();
};

// The audio->value mapping is a straight port of the Milkdrop/projectM family
// (butterchurn's AudioLevels): bass-band FFT sum, an asymmetric short average
// (fast attack, slower fall), and a very slow long average as the adaptive
// baseline. The visual value is the ratio of short to long average, which sits
// near 1.0 and follows the music directly; no onset gating, no envelopes.
// That directness is what makes the classic visualizers feel locked to the beat.
const BASS_LOW_HZ = 20;
const BASS_HIGH_HZ = 320;
// butterchurn rates are per 30fps frame; we run 60fps, so take sqrt
const ATTACK_KEEP = 0.447; // 0.2 ** (30/60), when the band is rising
const DECAY_KEEP = 0.85; // slower fall than butterchurn so decays glide, not snap
const LONG_KEEP = 0.996; // 0.992 ** (30/60)
const LONG_KEEP_WARMUP = 0.9;
const WARMUP_FRAMES = 50;
const OUTPUT_KNEE = 0.5; // ratio below this maps to zero
const OUTPUT_RANGE = 1.1; // ratio span mapped onto the full 0..1 output

let bassFirstBin = 1;
let bassLastBin = 13;
let shortAvg = 0;
let longAvg = 0;
let frameCount = 0;
let currentValue = 0;

// debug/tuning telemetry, see __audioDebug below
let lastDebug = { imm: 0, shortAvg: 0, longAvg: 0, att: 0, out: 0 };

const configureBands = (sampleRate: number, fftSize: number): void => {
  const bucketHz = sampleRate / fftSize;
  bassFirstBin = Math.max(1, Math.round(BASS_LOW_HZ / bucketHz));
  bassLastBin = Math.max(bassFirstBin, Math.round(BASS_HIGH_HZ / bucketHz));
};

const processFrame = (): void => {
  if (!analyser || !sampleBuffer) {
    return;
  }

  analyser.getByteFrequencyData(sampleBuffer);

  let imm = 0;
  for (let i = bassFirstBin; i <= bassLastBin; i += 1) {
    imm += sampleBuffer[i];
  }
  imm /= bassLastBin - bassFirstBin + 1;

  const keep = imm > shortAvg ? ATTACK_KEEP : DECAY_KEEP;
  shortAvg = shortAvg * keep + imm * (1 - keep);

  frameCount += 1;
  const longKeep = frameCount < WARMUP_FRAMES ? LONG_KEEP_WARMUP : LONG_KEEP;
  longAvg = longAvg * longKeep + imm * (1 - longKeep);

  const att = longAvg > 1 ? shortAvg / longAvg : 0;
  currentValue = Math.min(1, Math.max(0, (att - OUTPUT_KNEE) / OUTPUT_RANGE));
  lastDebug = { imm, shortAvg, longAvg, att, out: currentValue };
};

// beat-weighted amplitude 0..1 (same scale as the native module), or null when
// loopback capture is not active; reading is side-effect free
export const getSystemVolume = (): number | null => {
  return analyser ? currentValue : null;
};

// this module is also pulled into the main process bundle (via the settings
// schema importing the visualization list), where window does not exist
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-underscore-dangle
  (window as unknown as Record<string, unknown>).__audioDebug = (): typeof lastDebug => lastDebug;
}
