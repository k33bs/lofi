import { VisualizeConfiguration } from './models';
import { VisualizationProgram, visualize } from './visualization';

// A purpose-built reactive visual: the ring's radius IS the audio level, so it
// visibly breathes with the groove and jumps on beats. Hue drifts with time.
export const pulseRing = ({ canvas, timeFactor = 1000, peakFactor = 1 }: VisualizeConfiguration): void => {
  const program: VisualizationProgram = {
    fragmentShaderSource: `
    precision mediump float;
    uniform vec2 resolution;
    uniform float volume;
    uniform float time;

    vec3 hsv2rgb(vec3 c) {
        vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
        return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
    }

    void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        float r = length(p);
        float angle = atan(p.y, p.x);

        // ring radius rides the audio level directly
        float radius = 0.15 + volume * 0.75;

        // main ring glow
        float ring = (0.008 + volume * 0.03) / (abs(r - radius) + 0.008 + (1.0 - volume) * 0.04);

        // subtle angular shimmer so the ring is alive even at constant level
        float shimmer = 1.0 + 0.15 * sin(angle * 12.0 + time * 3.0);

        // soft inner fill that pumps with the level
        float fill = smoothstep(radius, 0.0, r) * volume * 0.25;

        float hue = fract(time * 0.03 + r * 0.15);
        vec3 color = hsv2rgb(vec3(hue, 0.75, 1.0)) * (ring * shimmer + fill);

        gl_FragColor = vec4(color, 1.0);
    }
    `,
    timeFactor,
    peakFactor,
  };
  visualize(canvas, program);
};
