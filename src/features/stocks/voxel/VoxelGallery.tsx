import { useEffect, useRef, type MutableRefObject } from "react";
import type { GalleryCamera, VoxelRenderer } from "./renderer";

export function VoxelGallery({ camera, dark, onWebGL }: { camera:MutableRefObject<GalleryCamera>; dark:boolean; onWebGL:(available:boolean)=>void }) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const darkRef=useRef(dark);darkRef.current=dark;
  useEffect(()=>{
    const canvas=canvasRef.current!;
    const host=canvas.parentElement!;
    let renderer:VoxelRenderer|undefined,frame=0,disposed=false,hover=-1,lean=0,lost=false;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop=()=>{cancelAnimationFrame(frame);frame=0};
    const draw=()=>{
      frame=0;
      if(disposed||document.hidden||lost)return;
      renderer?.render(camera.current,host.clientWidth,host.clientHeight,darkRef.current,hover,reduced.matches?0:lean);
      frame=requestAnimationFrame(draw);
    };
    const resume=()=>{stop();if(!document.hidden&&!lost)frame=requestAnimationFrame(draw)};
    const pointer=(event:PointerEvent)=>{
      const hit=(event.target as Element).closest<HTMLElement>("[data-stock-index]");
      hover=hit?Number(hit.dataset.stockIndex):-1;
      lean=hit?Math.max(-1,Math.min(1,(event.clientX-hit.getBoundingClientRect().x)/hit.getBoundingClientRect().width*2-1)):0;
    };
    const leave=()=>{hover=-1;lean=0};
    const create=()=>import("./renderer").then(module=>{
      if(disposed)return;
      renderer=module.createVoxelGalleryRenderer(canvas);
      host.dataset.voxelRenderer=renderer.mode;
      onWebGL(renderer.mode==="webgl");
      resume();
    }).catch(()=>{if(!disposed){host.dataset.voxelRenderer="unavailable";onWebGL(false)}});
    const onLost=(event:Event)=>{event.preventDefault();lost=true;stop();onWebGL(false);host.dataset.voxelRenderer="restoring";};
    const onRestored=()=>{renderer?.dispose();renderer=undefined;lost=false;void create();};
    document.addEventListener("visibilitychange",resume);
    host.addEventListener("pointermove",pointer);
    host.addEventListener("pointerleave",leave);
    canvas.addEventListener("webglcontextlost",onLost);
    canvas.addEventListener("webglcontextrestored",onRestored);
    void create();
    return ()=>{
      disposed=true;stop();renderer?.dispose();
      document.removeEventListener("visibilitychange",resume);
      host.removeEventListener("pointermove",pointer);host.removeEventListener("pointerleave",leave);
      canvas.removeEventListener("webglcontextlost",onLost);canvas.removeEventListener("webglcontextrestored",onRestored);
    };
  },[camera,onWebGL]);
  return <canvas ref={canvasRef} className="stock-voxel-canvas" aria-hidden="true" />;
}
