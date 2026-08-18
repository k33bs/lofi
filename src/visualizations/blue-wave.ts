import { VisualizeConfiguration } from './models';
import { VisualizationProgram, visualize } from './visualization';

export const blueWave = ({ canvas, timeFactor = 1000, peakFactor = 1 }: VisualizeConfiguration): void => {
  const program: VisualizationProgram = {
    fragmentShaderSource: `
        precision mediump float;
        uniform float time;
        uniform float volume;
        uniform vec2 resolution;
        
        void main() {
            vec2 p = (gl_FragCoord.xy / resolution.xy) - .5;
            // gentle baseline wave; only energy above the resting level of the
            // audio signal grows the amplitude, so quiet parts stay calm
            float v = 0.08 + max(0.0, volume - 0.35) * 1.4;
            float sx = v * (p.x * p.x * 3. - v) * sin(10. * p.x - 5. * time * 0.005);
            gl_FragColor = vec4(.05, .0, (5. / (420. * abs(p.y + sx))), 1);
        }
      `,
    timeFactor,
    peakFactor,
  };
  visualize(canvas, program);
};
