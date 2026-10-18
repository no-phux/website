import type { MutableRefObject } from "react";
import { createMotion, type Motion, type Pointer, type SceneSettings } from "./scene-motion";

/** Canvas stand-in for the optical field while WebGPU warms up or when it is unavailable. */
function paintLivingGlass(ctx: CanvasRenderingContext2D, width: number, height: number, m: Motion) {
  const background=ctx.createLinearGradient(0,0,width,height);
  background.addColorStop(0,"#05080d");background.addColorStop(.54,"#101923");background.addColorStop(1,"#070b12");
  ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.translate(width*.61+m.pointer.x*8,height*.48-m.pointer.y*6);ctx.rotate(-.36+m.to*.027);
  const phase=m.time*.045+m.to*.18;
  const path=new Path2D();
  for(let step=0;step<=50;step++){
    const x=(step/50-.5)*width*2,y=(Math.sin(x/height*2.16+phase)*(.24+m.amplitude*.035)+.075*Math.sin(x/height*3.42-m.time*.028))*height*.5;
    if(step===0)path.moveTo(x,y);else path.lineTo(x,y);
  }
  const reflection=ctx.createLinearGradient(-width,0,width,0);
  reflection.addColorStop(0,"rgba(120,150,176,0)");reflection.addColorStop(.45,"rgba(143,169,193,.25)");reflection.addColorStop(.7,"rgba(171,188,204,.34)");reflection.addColorStop(1,"rgba(120,150,176,0)");
  ctx.lineCap="round";ctx.strokeStyle=reflection;
  for(const [thickness,alpha] of [[.24,.14],[.16,.18],[.09,.25],[.035,.30]]){
    ctx.globalAlpha=alpha;ctx.lineWidth=height*thickness;ctx.stroke(path);
  }
  ctx.globalAlpha=.24;ctx.translate(0,height*.25);ctx.lineWidth=height*.10;ctx.strokeStyle="rgba(129,156,182,.23)";ctx.stroke(path);
  ctx.restore();
}
function paintGlass(ctx: CanvasRenderingContext2D, width: number, height: number, m: Motion, variant: number, liveMaterial = false) {
  if(liveMaterial){paintLivingGlass(ctx,width,height,m);return;}
  const scale = height * .5, centerX = width * .66 + m.pointer.x * 12, centerY = height * .5 - m.pointer.y * 9;
  const rgb = m.color.map(c => Math.round(c * 255)).join(",");
  ctx.fillStyle = "#020305"; ctx.fillRect(0,0,width,height);
  ctx.save(); ctx.translate(centerX,centerY); ctx.rotate(-.13);
  const radius = scale * .48 * (.9 + m.amplitude * .1) * (1 - m.spread * .05), mode = variant === 0 ? 0 : m.to;
  const halo = ctx.createRadialGradient(0,0,radius*.7,0,0,radius*1.8);
  halo.addColorStop(0,`rgba(${rgb},0)`); halo.addColorStop(.34,`rgba(${rgb},.18)`); halo.addColorStop(1,`rgba(${rgb},0)`);
  ctx.fillStyle = halo; ctx.fillRect(-scale*2,-scale*2,scale*4,scale*4);
  if (mode === 0) {
    ctx.shadowColor = `rgba(${rgb},.7)`; ctx.shadowBlur = 22;
    ctx.strokeStyle = `rgba(${rgb},.8)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0,0,radius,radius,0,0,Math.PI*2); ctx.stroke();
    const beam = ctx.createLinearGradient(0,-scale*.16,0,scale*.16);
    beam.addColorStop(0,`rgba(${rgb},0)`); beam.addColorStop(.46,`rgba(${rgb},.12)`); beam.addColorStop(.50,"rgba(255,232,200,.9)"); beam.addColorStop(.54,`rgba(${rgb},.12)`); beam.addColorStop(1,`rgba(${rgb},0)`);
    ctx.fillStyle=beam;ctx.fillRect(-scale*2,-scale*.16,scale*4,scale*.32);
    ctx.shadowBlur=0;ctx.fillStyle="#020305";ctx.beginPath();ctx.arc(0,0,radius*.98,0,Math.PI*2);ctx.fill();
  } else {
    ctx.rotate(-.3 + (mode-1)*.21 + Math.sin(m.time*.04)*.1);
    const layers = mode===3 ? 5 : 3;
    for (let layer=0;layer<layers;layer++) {
      ctx.beginPath();
      for (let step=0;step<=90;step++) {
        const x=(step/90-.5)*width*1.5, y=Math.sin(x/scale*1.3+m.time*.12+layer*.2)*scale*.2+(layer-1)*scale*.16;
        if(step===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=3+layer;ctx.shadowBlur=24;ctx.shadowColor=`rgba(${rgb},.7)`;ctx.strokeStyle=`rgba(${rgb},${.35+layer*.15})`;ctx.stroke();
      ctx.lineWidth=.7;ctx.shadowBlur=0;ctx.strokeStyle="rgba(238,245,255,.6)";ctx.stroke();
    }
  }
  ctx.restore();
}
export function drawFallback(canvas: HTMLCanvasElement, variant: number, settings: MutableRefObject<SceneSettings>, detached: MutableRefObject<boolean>, pointer: Pointer, reduced: MediaQueryList, miniature: boolean, isVisible: () => boolean, onReady: () => void, liveMaterial = false) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  canvas.dataset.opticalWorld = liveMaterial ? "liquid" : "archive";
  let raf = 0, firstFrame = true, lastPaint = 0;
  const motion = createMotion(settings.current);
  const drawFrame = (now: number) => {
    raf=requestAnimationFrame(drawFrame);
    if(!firstFrame && (document.hidden || !isVisible() || now-lastPaint < (reduced.matches ? 80 : 40))) return;
    lastPaint=now;
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio,miniature?1:1.25);
    const width = Math.max(1,Math.round(box.width*dpr)), height = Math.max(1,Math.round(box.height*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const current=motion(settings.current,detached.current,pointer,reduced.matches,now);
    canvas.dataset.shape=String(current.to);canvas.dataset.morph=current.progress.toFixed(3);
    ctx.setTransform(dpr,0,0,dpr,0,0);paintGlass(ctx,box.width,box.height,current,variant,liveMaterial);
    if(firstFrame){firstFrame=false;onReady();}
  };
  raf=requestAnimationFrame(drawFrame);
  return ()=>cancelAnimationFrame(raf);
}
