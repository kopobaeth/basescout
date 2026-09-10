import { useEffect, useRef } from "react";
import { createStructureFlowRenderer, STRUCTURE_FLOW_DEFAULTS, type StructureFlowOptions } from "./structureFlowRenderer";

export type StructureFlowBackgroundProps = Partial<StructureFlowOptions> & { className?: string };

// Host-only lifecycle adaptation; the authored renderer is byte-for-byte unchanged.
export function StructureFlowBackground({ className = "", ...props }: StructureFlowBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef({ ...STRUCTURE_FLOW_DEFAULTS, ...props });
  optionsRef.current = { ...STRUCTURE_FLOW_DEFAULTS, ...props };

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    if (!host || !canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: ReturnType<typeof createStructureFlowRenderer> | undefined;
    let frame = 0, visible = true, lost = false, disposed = false;
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const canAnimate = () => !disposed && !lost && visible && !document.hidden && !reduced.matches && !!renderer;
    const tick = () => {
      frame = 0;
      if (!canAnimate()) return;
      renderer!.render();
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      if (canAnimate()) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      if (!renderer || lost) return;
      const bounds = host.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      renderer.resize(bounds.width, bounds.height);
      renderer.render();
    };
    const create = () => {
      try {
        renderer = createStructureFlowRenderer(canvas, () => ({ ...optionsRef.current, speed: reduced.matches ? 0 : optionsRef.current.speed }));
        host.dataset.renderer = "ready";
        resize();
        sync();
      } catch {
        renderer?.dispose();
        renderer = undefined;
        host.dataset.renderer = "unavailable";
      }
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      host.dataset.renderer = "context-lost";
      stop();
    };
    const contextRestored = () => {
      renderer?.dispose();
      renderer = undefined;
      lost = false;
      create();
    };
    const motionChanged = () => { resize(); sync(); };
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", motionChanged);
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; sync(); });
    resizeObserver.observe(host);
    intersection.observe(host);
    create();
    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", motionChanged);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      renderer?.dispose();
    };
  }, []);

  const options = optionsRef.current;
  const mask = `linear-gradient(to bottom, transparent ${options.maskStart * 100}%, black ${options.maskSolid * 100}%, black 100%)`;
  return <div ref={hostRef} className={`threeui-background structure-flow${className ? ` ${className}` : ""}`} style={{ opacity: 0.8, WebkitMaskImage: mask, maskImage: mask }}><canvas ref={canvasRef} /></div>;
}
