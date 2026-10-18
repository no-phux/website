import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { gpuPool, opticalBackingSize, opticalFrameDeadline, startOpticalWarmup } from "./gpu-runtime";
import { createRenderMetrics } from "./gpu-metrics";
import atmosphere from "./atmosphere.wgsl";
import { createMotion, ease, type Pointer, type SceneGlass, type SceneSettings } from "./scene-motion";
import { drawFallback } from "./scene-fallback";

export { initialSettings, type SceneGlass, type SceneSettings } from "./scene-motion";

type SceneProps = { variant: number; settings: MutableRefObject<SceneSettings>; detached?: boolean; miniature?: boolean; active?: boolean; ambient?: boolean; input?:MutableRefObject<Pointer>; glass?:MutableRefObject<SceneGlass> };
export function Scene({ variant, settings, detached = false, miniature = false, active = true, ambient = false, input, glass }: SceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const detachedRef = useRef(detached);
  detachedRef.current = detached;
  const [renderer, setRenderer] = useState("Preparing light field");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false, fallbackStarted = false, onScreen = true;
    let cancelWarmup = () => {};
    let releaseGpu = () => {}, disposeSurface = () => {}, disposeField = () => {}, disposeMetrics = () => {};
    let stop = () => {}, fallbackStop = () => {}, removeErrorListener = () => {};
    const cleanupGpu = () => {
      stop(); removeErrorListener(); disposeMetrics(); disposeField(); disposeSurface(); releaseGpu();
      stop = removeErrorListener = disposeMetrics = disposeField = disposeSurface = releaseGpu = () => {};
    };
    const element = canvas.current!;
    const bootStartedAt = performance.now();
    let stageStartedAt = bootStartedAt, stage = "";
    const bootStage = (next: string) => {
      const now = performance.now();
      for (const node of [element,element.parentElement!]) {
        if (stage) node.dataset[`boot${stage[0].toUpperCase()+stage.slice(1)}Ms`] = (now-stageStartedAt).toFixed(1);
        node.dataset.bootStage = next;
        node.dataset.bootStartedAt = bootStartedAt.toFixed(1);
        node.dataset.bootStageStartedAt = now.toFixed(1);
        node.dataset.bootElapsedMs = (now-bootStartedAt).toFixed(1);
      }
      stage = next; stageStartedAt = now;
    };
    const visibility = new IntersectionObserver(entries => { onScreen = entries[0]?.isIntersecting ?? false; }, { rootMargin: "120px" });
    visibility.observe(element);
    let resizeDirty = true;
    const resize = new ResizeObserver(() => { resizeDirty = true; });
    resize.observe(element);
    element.style.opacity = "1";
    setReady(false); setRenderer("Preparing light field");
    const pointer: Pointer = input?.current || { x: 0, y: 0, active: 0 };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / Math.max(box.width, 1) * 2 - 1;
      pointer.y = 1 - (event.clientY - box.top) / Math.max(box.height, 1) * 2;
      pointer.active = 1;
    };
    const leave = () => { pointer.active = 0; };
    if (!input) {
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerleave", leave);
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const showCanvas = (label: string) => {
      if (disposed) return;
      fallbackStop();
      element.style.opacity = "0";
      setRenderer(label);
      fallbackStop = drawFallback(fallback.current!, variant, settings, detachedRef, pointer, reduced, miniature, () => onScreen && activeRef.current, () => { if (!disposed) setReady(true); }, Boolean(glass));
    };
    const useFallback = (error: unknown) => {
      if (disposed || fallbackStarted) return;
      fallbackStarted = true;
      cancelWarmup();
      cleanupGpu(); bootStage("fallback");
      element.parentElement!.dataset.bootPreview = "canvas";
      console.info("PHUX light field: using Canvas renderer", error);
      showCanvas("Canvas · optical field");
    };
    const boot = async () => {
      bootStage("import");
      const { surface, effect, frame, timer } = await import("vgpu");
      if (disposed || fallbackStarted) return;
      bootStage("acquire");
      const lease = await gpuPool.acquire();
      const context = lease.gpu;
      releaseGpu = lease.release;
      if (disposed || fallbackStarted) { releaseGpu(); return; }
      void context.lost.then(info => { if (!disposed && info.reason !== "destroyed") useFallback(info.message); });
      let cssWidth = element.clientWidth, cssHeight = element.clientHeight, lastDpr = devicePixelRatio;
      const desiredSize = () => {
        cssWidth = element.clientWidth; cssHeight = element.clientHeight;
        return opticalBackingSize(cssWidth,cssHeight,devicePixelRatio,ambient,miniature);
      };
      bootStage("surface");
      const target = surface(context, element, { autoResize: false, size: desiredSize() });
      disposeSurface = () => target.dispose();
      const gpuTimer = context.gpu.features.has("timestamp-query") ? timer(context) : undefined;
      const metrics = createRenderMetrics(element, lease.id, gpuTimer);
      disposeMetrics = () => metrics.dispose();
      let motion = createMotion(settings.current);
      const current = motion(settings.current, detachedRef.current, pointer, reduced.matches);
      const rect = element.getBoundingClientRect();
      const data = {
        timing: [current.time, rect.width / Math.max(rect.height, 1), variant, 0],
        scene: [current.amplitude, current.to, current.spread, miniature ? 0.72 : 0.82],
        color: [...current.color, 1], pointer: [0, 0, 0, 0],
        morph: [current.from, current.to, current.progress, 0],
        topology: [Math.max(cssWidth,1), Math.max(cssHeight,1), target.size[0], target.size[1]],
        glass0: [0,0,0,0], glass1: [0,0,0,0], glass2: [0,0,0,0], glass3: [0,0,0,0], glassMeta: [0,0,0,0],
        neck0: [0,0,0,0], neck1: [0,0,0,0], neck2: [0,0,0,0], neckRadii: [0,0,0,0],
      };
      const updateGlass = () => {
        const rects = (glass?.current.rects ?? []).filter(rect => rect.length === 4 && rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0).slice(0,4);
        data.glass0 = rects[0] ?? [0,0,0,0]; data.glass1 = rects[1] ?? [0,0,0,0];
        data.glass2 = rects[2] ?? [0,0,0,0]; data.glass3 = rects[3] ?? [0,0,0,0];
        // Fixed-size uniforms keep malformed/extreme layout data out of the GPU.
        // Endpoints may briefly leave the viewport while a pane buds or retracts.
        const necks = rects.length === 0 ? [] : (glass?.current.necks ?? [])
          .filter(neck => neck.length === 5 && neck.every(Number.isFinite) && neck[4] > 0)
          .slice(0,3).map(neck => [
            ...neck.slice(0,4).map(value => Math.max(-0.5,Math.min(1.5,value))),
            Math.min(neck[4],0.12),
          ]);
        data.neck0 = necks[0]?.slice(0,4) ?? [0,0,0,0];
        data.neck1 = necks[1]?.slice(0,4) ?? [0,0,0,0];
        data.neck2 = necks[2]?.slice(0,4) ?? [0,0,0,0];
        data.neckRadii = [necks[0]?.[4] ?? 0,necks[1]?.[4] ?? 0,necks[2]?.[4] ?? 0,necks.length];
        const neckKey = necks.map(neck => neck.map(value => value.toFixed(6)).join(",")).join(";");
        if (element.dataset.glassNecks !== neckKey) {
          element.dataset.glassNecks = neckKey; element.dataset.glassNeckCount = String(necks.length);
        }
        const pulse = glass?.current.pulse;
        const age = pulse === undefined ? Infinity : performance.now()-pulse;
        const responding = !reduced.matches && Number.isFinite(age) && age >= 0 && age < 1500;
        // A short, eased attack avoids a hard lighting flash. Hidden views do
        // not render or replay the impulse when they return after it settles.
        const energy = responding ? ease(Math.min(age/70,1))*ease(1-age/1500) : 0;
        const pulseAge = responding ? age/1000 : 0;
        data.glassMeta = [rects.length,energy,pulseAge,glass ? 1 : 0];
        element.dataset.opticalWorld = glass ? "liquid" : "archive";
        element.dataset.glassEnergy = energy.toFixed(3);
        const key = rects.map(rect => rect.map(value => value.toFixed(5)).join(",")).join(";");
        if (element.dataset.glassLayout !== key) {
          element.dataset.glassLayout = key; element.dataset.glassCount = String(rects.length);
        }
        return `${key}/${neckKey}/${energy.toFixed(5)}/${pulseAge.toFixed(4)}`;
      };
      updateGlass();
      const field = effect(context, atmosphere, { set: { params: data } });
      disposeField = () => field.dispose();
      bootStage("compile");
      await field.compile(target);
      if (disposed || fallbackStarted) return;
      motion = createMotion(settings.current);
      const first = motion(settings.current,detachedRef.current,pointer,reduced.matches);
      data.timing[0] = first.time; data.scene[0] = first.amplitude;
      data.color = [...first.color,1]; data.morph = [first.from,first.to,first.progress,0];
      updateGlass();
      field.set({params:data});
      const submitted = frame(context, currentFrame => currentFrame.pass(target, field));
      bootStage("settled");
      await submitted.done;
      bootStage("queue");
      await context.gpu.queue.onSubmittedWorkDone();
      if (disposed || fallbackStarted) return;
      cancelWarmup();
      fallbackStop(); fallbackStop = () => {};
      element.style.opacity = "1";
      bootStage("ready");
      element.parentElement!.dataset.bootPreview = "webgpu";
      setReady(true);
      setRenderer("vgpu · WebGPU · optical field");
      removeErrorListener = context.onError(error => useFallback(error));
      let raf = 0, nextFrame = 0, lastStaticKey = "", lastGlassKey = "", lastMotion = 0;
      const drawCurrentState = (now: number) => {
        const cpuStart = performance.now();
        const state = settings.current;
        const glassKey = updateGlass();
        if (glassKey !== lastGlassKey) { lastGlassKey = glassKey; lastMotion = now; }
        const current = motion(state, detachedRef.current, pointer, reduced.matches);
        // A paused/reduced-motion view renders on changes instead of submitting empty frames.
        let staticKey = "";
        if (state.paused || reduced.matches) {
          staticKey = [current.from,current.to,current.progress,current.amplitude,current.spread,...current.color,current.pointer.x,current.pointer.y,current.burst].map(value => value.toFixed(5)).join("/")+"/"+glassKey;
          if (staticKey === lastStaticKey && !resizeDirty) { metrics.idle(); return; }
        }
        lastStaticKey = staticKey;
        if (resizeDirty) target.resize(desiredSize());
        frame(context, currentFrame => {
          const size = target.size;
          data.timing = [current.time, size[0] / Math.max(size[1], 1), variant, 0];
          data.scene = [current.amplitude, current.to, current.spread, miniature ? 0.72 : 0.82];
          data.color = [...current.color, 1];
          data.pointer = [current.pointer.x, current.pointer.y, current.pointer.active, current.burst];
          data.morph = [current.from, current.to, current.progress, 0];
          data.topology = [Math.max(cssWidth,1), Math.max(cssHeight,1), size[0], size[1]];
          field.set({ params: data });
          currentFrame.pass({ target, timer: metrics.sample(now) }, field);
        });
        resizeDirty = false;
        element.dataset.shape = String(current.to);
        element.dataset.morph = current.progress.toFixed(3);
        metrics.submitted(now, performance.now()-cpuStart);
      };
      const render = (now: number) => {
        raf = requestAnimationFrame(render);
        if (lastDpr !== devicePixelRatio) { lastDpr = devicePixelRatio; resizeDirty = true; }
        if (document.hidden || !onScreen || !activeRef.current) { metrics.idle(); return; }
        // An untouched ambient field drifts slowly; half rate is indistinguishable
        // and halves its GPU cost. Pointer or glass motion restores full rate.
        const lively = !ambient || pointer.active > 0 || now-lastMotion < 700;
        const interval = reduced.matches ? 1000/12 : miniature ? 1000/24 : lively ? 1000/60 : 1000/30;
        const deadline = opticalFrameDeadline(now,nextFrame,interval);
        if (deadline === undefined) return;
        nextFrame = deadline;
        try { drawCurrentState(now); }
        catch (error) { useFallback(error); }
      };
      raf = requestAnimationFrame(render);
      stop = () => cancelAnimationFrame(raf);
    };
    const warmup = startOpticalWarmup(() => {
      if (disposed || fallbackStarted) return;
      element.parentElement!.dataset.bootPreview = "canvas-warmup";
      showCanvas("Canvas · warming WebGPU");
    });
    cancelWarmup = warmup.cancel;
    void warmup.during(boot()).catch(useFallback);
    return () => {
      disposed = true; cancelWarmup();
      visibility.disconnect(); resize.disconnect();
      cleanupGpu(); fallbackStop();
      if (!input) {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerleave", leave);
      }
    };
  }, [variant, miniature, ambient, settings, input, glass]);
  return <div className="gpu-scene" data-renderer={renderer} data-ready={ready}>
    <canvas ref={fallback} className="scene-fallback" aria-hidden="true" />
    <canvas ref={canvas} aria-label="Live refractive light field; move the pointer to bend its horizon" />
    {!miniature && <span className="render-label">{renderer}</span>}
  </div>;
}

