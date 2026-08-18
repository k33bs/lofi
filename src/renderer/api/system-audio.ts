/* eslint-disable no-console */

// macOS system audio for the visualizations. The native volume module needs a
// helper daemon that was never shipped on macOS, so it always reads 0 there;
// Chromium's loopback capture (served by the display media handler in the main
// process) provides the signal instead. Windows keeps the native module and
// this file stays inert off macOS.

let analyser: AnalyserNode | null = null;
let sampleBuffer: Float32Array<ArrayBuffer> | null = null;
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
      node.fftSize = 1024;
      source.connect(node);

      sampleBuffer = new Float32Array(node.fftSize);
      analyser = node;
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

// current peak amplitude 0..1, matching the native module's scale,
// or null when loopback capture is not active
export const getSystemVolume = (): number | null => {
  if (!analyser || !sampleBuffer) {
    return null;
  }

  analyser.getFloatTimeDomainData(sampleBuffer);
  let peak = 0;
  for (let i = 0; i < sampleBuffer.length; i += 1) {
    const value = Math.abs(sampleBuffer[i]);
    if (value > peak) {
      peak = value;
    }
  }

  return peak;
};
