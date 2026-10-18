// Scene state shared by the WebGPU field and its Canvas fallback.
type Vector = [number, number, number];
export type SceneSettings = {
  speed: number; amplitude: number; shape: number; color: Vector;
  burst: number; paused: boolean; sceneTime?: number;
};
export const initialSettings: SceneSettings = { speed: 1, amplitude: 1, shape: 0, color: [0.96, 0.60, 0.29], burst: 0, paused: false };
export type SceneGlass = {
  rects: [number,number,number,number][]; pulse?: number;
  /** Normalized stage endpoints and radius / stage height; at most three. */
  necks?: [number,number,number,number,number][];
};
export type Pointer = { x: number; y: number; active: number };
export const ease = (x: number) => x * x * (3 - 2 * x);
const blend = (a: number, b: number, f: number) => a + (b - a) * f;
const shapeIndex = (shape: number) => Math.max(0, Math.min(5, Math.round(shape)));

/** Shared animation state gives both renderers identical transition semantics. */
export function createMotion(initial: SceneSettings) {
  let previous = performance.now(), phaseSeenAt = previous;
  let serverPhase = initial.sceneTime;
  let time = serverPhase ?? 0, amplitude = initial.amplitude, speed = initial.speed;
  let from = shapeIndex(initial.shape), to = from, progress = 1, spread = 0;
  const color: Vector = [...initial.color];
  const pointer = { x: 0, y: 0, active: 0 };
  const advancePhase = (state: SceneSettings, now: number, dt: number, reduced: boolean) => {
    speed = blend(speed, state.speed, 1 - Math.exp(-dt * 3));
    if (state.paused || reduced) return;
    time += dt * speed;
    if (state.sceneTime === undefined) return;
    if (state.sceneTime !== serverPhase) { serverPhase = state.sceneTime; phaseSeenAt = now; }
    const target = state.sceneTime + (now - phaseSeenAt) / 1000 * speed;
    time = blend(time, target, 1 - Math.exp(-dt * 2));
  };
  return (state: SceneSettings, detached: boolean, input: Pointer, reduced: boolean, now = performance.now()) => {
    const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.05);
    previous = now;
    advancePhase(state, now, dt, reduced);
    const requested = shapeIndex(state.shape);
    // Finish an in-flight morph before accepting another, preserving continuity.
    if (progress >= 1 && requested !== to) { from = to; to = requested; progress = 0; }
    progress = reduced ? 1 : Math.min(1, progress + dt / 1.45);
    if (progress >= 1) from = to;
    const smoothing = reduced ? 1 : 1 - Math.exp(-dt * 4);
    amplitude = blend(amplitude, state.amplitude, smoothing);
    spread = blend(spread, Number(detached), smoothing);
    for (let i = 0; i < 3; i++) color[i] = blend(color[i], state.color[i], smoothing);
    pointer.x = blend(pointer.x, input.x, smoothing);
    pointer.y = blend(pointer.y, input.y, smoothing);
    pointer.active = blend(pointer.active, input.active, smoothing);
    const burst = Math.max(0, 1 - (Date.now() - state.burst) / 2100);
    return { time, amplitude, color, from, to, progress: ease(progress), spread, pointer, burst };
  };
}
export type Motion = ReturnType<ReturnType<typeof createMotion>>;

