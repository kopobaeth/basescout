import { useEffect, useRef, useState } from "react";
import { STOCKS, stockPath } from "./catalog";
import type { ThemePreference } from "../../theme";
import "./stocks-canvas.css";
import "./stocks-brand.css";

const W = 6000, H = 4200;
const exhibits = STOCKS.map((stock, i) => ({ ...stock, x: 750 + i % 4 * 1450, y: 620 + Math.floor(i / 4) * 1050 }));
const wrap = (n: number, size: number) => ((n % size) + size) % size;
type Point = { x: number; y: number };

export default function StocksCanvas({ theme, onThemeChange }: { theme: ThemePreference; onThemeChange: (theme: ThemePreference) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const indexInput = useRef<HTMLInputElement>(null);
  const indexButton = useRef<HTMLButtonElement>(null);
  const zoomControl = useRef<(factor: number) => void>(() => {});
  const userInteracted = useRef(false);
  const cam = useRef({ x: 2900, y: 1800, z: .48, tx: 2900, ty: 1800, tz: .48, vx: 0, vy: 0 });
  const [indexOpen, setIndexOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const blocked = useRef(false);
  blocked.current = indexOpen || selected !== null;
  const fly = (i: number) => {
    userInteracted.current = true;
    const c = cam.current, a = exhibits[i];
    c.tx = c.x + wrap(a.x - c.x + W / 2, W) - W / 2;
    c.ty = c.y + wrap(a.y - c.y + H / 2, H) - H / 2;
    c.tz = Math.min(1.8, window.innerWidth * .75 / 760, window.innerHeight * .65 / 450);
    c.vx = c.vy = 0;
    setIndexOpen(false); setTouched(true);
    stage.current?.focus();
  };
  useEffect(() => {
    setReportReady(false);
    if (selected !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  useEffect(() => { if (indexOpen) indexInput.current?.focus(); }, [indexOpen]);
  useEffect(() => {
    const el = stage.current!;
    const pointers = new Map<number, Point>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let moved = false, pinch = false, start: Point = { x: 0, y: 0 }, lastTime = 0;
    let frame = 0, previous = performance.now();
    const min = () => Math.max(el.clientWidth / (W - 1000), el.clientHeight / (H - 1000));
    const zoom = (x: number, y: number, factor: number) => {
      const c = cam.current;
      const z = Math.max(min(), Math.min(5.2, c.tz * factor));
      c.tx += (x - el.clientWidth / 2) * (1 / c.tz - 1 / z);
      c.ty += (y - el.clientHeight / 2) * (1 / c.tz - 1 / z);
      c.tz = z; c.vx = c.vy = 0;
    };
    zoomControl.current = factor => { userInteracted.current = true; setTouched(true); zoom(el.clientWidth / 2, el.clientHeight / 2, factor); };
    // Start with the first pair of assets; a short dolly settles before interaction.
    const c = cam.current;
    c.x = c.tx = 1475; c.y = c.ty = 900;
    c.z = Math.max(min(), Math.min(.48, el.clientWidth / 2800));
    c.tz = c.z;
    const intro = window.setTimeout(() => {
      if (userInteracted.current || blocked.current) return;
      c.ty = 750;
      c.tz = Math.max(min(), Math.min(.62, el.clientWidth / 2500));
      if (reduced.matches) { c.y = c.ty; c.z = c.tz; }
    }, 180);
    const down = (e: PointerEvent) => {
      if (blocked.current || e.button !== 0) return;
      userInteracted.current = true;
      el.setPointerCapture(e.pointerId);
      if (!pointers.size) { start = { x: e.clientX, y: e.clientY }; moved = false; pinch = false; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size > 1) pinch = true;
      cam.current.vx = cam.current.vy = 0;
      lastTime = performance.now(); setTouched(true);
    };
    const move = (e: PointerEvent) => {
      const old = pointers.get(e.pointerId); if (!old) return;
      const before = [...pointers.values()];
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = [...pointers.values()], c = cam.current;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) moved = true;
      if (after.length === 2) {
        const d = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
        if (d > 1) zoom((after[0].x + after[1].x) / 2, (after[0].y + after[1].y) / 2, Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y) / d);
        c.tx -= ((after[0].x + after[1].x) - (before[0].x + before[1].x)) / 2 / c.tz;
        c.ty -= ((after[0].y + after[1].y) - (before[0].y + before[1].y)) / 2 / c.tz;
      } else {
        const dt = Math.max(.008, (performance.now() - lastTime) / 1000);
        c.tx -= (e.clientX - old.x) / c.tz; c.ty -= (e.clientY - old.y) / c.tz;
        c.vx = Math.max(-1400, Math.min(1400, -(e.clientX - old.x) / dt)) / c.tz;
        c.vy = Math.max(-1400, Math.min(1400, -(e.clientY - old.y) / dt)) / c.tz;
      }
      c.x = c.tx; c.y = c.ty; c.z = c.tz;
      lastTime = performance.now();
    };
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (e.type === "pointercancel" || pinch || performance.now() - lastTime > 100 || reduced.matches) cam.current.vx = cam.current.vy = 0;
      if (e.type !== "pointercancel" && !moved && !pinch) {
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-stock-index]");
        if (target) setSelected(Number(target.dataset.stockIndex));
      }
    };
    const wheel = (e: WheelEvent) => { if (blocked.current) return; userInteracted.current = true; e.preventDefault(); setTouched(true); zoom(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode === 1 ? .035 : .0015))); };
    const keys = (e: KeyboardEvent) => {
      if (blocked.current) return;
      userInteracted.current = true;
      const c = cam.current, delta = 180 / c.tz;
      if (e.key.startsWith("Arrow")) { e.preventDefault(); setTouched(true); c.tx += e.key === "ArrowRight" ? delta : e.key === "ArrowLeft" ? -delta : 0; c.ty += e.key === "ArrowDown" ? delta : e.key === "ArrowUp" ? -delta : 0; }
      if (e.key === "+" || e.key === "=" || e.key === "-") { e.preventDefault(); zoom(el.clientWidth / 2, el.clientHeight / 2, e.key === "-" ? .8 : 1.25); }
    };
    const draw = (time: number) => {
      const dt = Math.min(.04, (time - previous) / 1000); previous = time;
      const c = cam.current;
      if (!pointers.size && !blocked.current) { c.tx += c.vx * dt; c.ty += c.vy * dt; c.vx *= Math.exp(-5.5 * dt); c.vy *= Math.exp(-5.5 * dt); }
      c.tz = Math.max(min(), c.tz);
      const k = reduced.matches ? 1 : 1 - Math.exp(-10 * dt);
      c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k;
      const wx = Math.floor(c.x / W) * W, wy = Math.floor(c.y / H) * H;
      c.x -= wx; c.tx -= wx; c.y -= wy; c.ty -= wy;
      world.current!.style.transform = `translate3d(${el.clientWidth / 2 - c.x * c.z}px,${el.clientHeight / 2 - c.y * c.z}px,0) scale(${c.z})`;
      if (readout.current) readout.current.textContent = `${Math.round(c.x).toString().padStart(4,"0")} / ${Math.round(c.y).toString().padStart(4,"0")} — ${Math.round(c.z * 100)}%`;
      const ctx = map.current?.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 180, 126); ctx.fillStyle = "#a0a0a6";
        exhibits.forEach(a => ctx.fillRect(a.x / W * 180 - 2, a.y / H * 126 - 2, 4, 4));
        ctx.strokeStyle = "#0052ff";
        for (const x of [-W, 0, W]) for (const y of [-H, 0, H]) ctx.strokeRect((c.x + x - el.clientWidth / c.z / 2) / W * 180, (c.y + y - el.clientHeight / c.z / 2) / H * 126, el.clientWidth / c.z / W * 180, el.clientHeight / c.z / H * 126);
      }
      frame = requestAnimationFrame(draw);
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("keydown", keys);
    frame = requestAnimationFrame(draw);
    return () => { clearTimeout(intro); cancelAnimationFrame(frame); zoomControl.current = () => {}; el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("wheel", wheel); el.removeEventListener("keydown", keys); };
  }, []);

  return <main className="stocks-page stock-universe">
    <div ref={stage} className="stock-stage" tabIndex={0} aria-label="Infinite stocks gallery. Drag to pan, scroll to zoom, or use arrow keys and plus/minus. Use Index for an accessible asset list.">
      <div ref={world} className="stock-world">
        {[-1,0,1].flatMap(rx => [-1,0,1].map(ry => <div key={`${rx}-${ry}`} className="stock-world-tile" style={{left: rx * W, top: ry * H}} aria-hidden="true">
          <div className="stock-money stock-money-coin stock-money-one"><span>$</span></div>
          <div className="stock-money stock-money-note"><span>$</span></div>
          <div className="stock-money stock-money-coin stock-money-two"><span>◈</span></div>
          <div className="stock-money stock-money-coin stock-money-three"><span>$</span></div>
          <div className="stock-world-title">EQUITIES.<br /><span>WITHOUT WALLS.</span><small>BASESCOUT / TOKENIZED STOCK RESEARCH</small></div>
          {exhibits.map((a,i) => <div key={a.address} data-stock-index={i} className={`stock-exhibit stock-exhibit-${i % 3}`} style={{left:a.x - 380, top:a.y - 225}}>
            <small>{String(i+1).padStart(2,"0")} — BASE / B20</small><strong>{a.symbol.replace(/c$/,"")}</strong><div><span>{a.name}</span><span>Open report ↗</span></div>
          </div>)}
        </div>))}
      </div>
    </div>
    <header className="stock-hud"><a href="/" className="stocks-brand"><img src="/basescout.svg" alt="" /><span className="stocks-brand-name">BaseScout</span></a><span className="stock-hud-label">Stocks</span><nav aria-label="Research navigation"><a href="/">Token scanner</a><a href="/trending">Trending</a><a href="/basepaint">BasePaint</a><a href="/stocks" aria-current="page">Stocks</a></nav><select aria-label="Appearance" value={theme} onChange={e => onThemeChange(e.target.value as ThemePreference)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select><button ref={indexButton} onClick={() => setIndexOpen(true)}>Index / 13 ≡</button></header>
    {!touched && <p className="stock-drift-hint">Drag to explore · Scroll or pinch to zoom · Select an asset to research</p>}
    <div className="stock-camera-tools" role="group" aria-label="Canvas controls"><button aria-label="Zoom out" onClick={() => zoomControl.current(.8)}>−</button><button aria-label="Zoom in" onClick={() => zoomControl.current(1.25)}>+</button><button onClick={() => fly(0)}>Reset view</button></div>
    <footer className="stock-hud-bottom"><div><span ref={readout} /><p>Research only · No trading</p><a href="https://docs.base.org/specifications/b20/tokenized-stocks-on-base" target="_blank" rel="noreferrer">B20 source ↗</a></div><div className="stock-map"><span>YOU ARE HERE</span><canvas ref={map} width={180} height={126} aria-label="Map of stock positions and current viewport" /></div></footer>
    {indexOpen && <aside className="stock-index" aria-label="Stock index" onKeyDown={e => { if(e.key === "Escape") { setIndexOpen(false); indexButton.current?.focus(); } }}>
      <header><span>Index / {exhibits.length} assets</span><button onClick={() => {setIndexOpen(false); indexButton.current?.focus();}}>Close ×</button></header>
      <input ref={indexInput} aria-label="Search stocks" placeholder="Company or ticker" value={query} onChange={e => setQuery(e.target.value)} />
      {!exhibits.some(a => `${a.name} ${a.symbol} ${a.address}`.toLowerCase().includes(query.toLowerCase().trim())) && <p role="status">No matching stocks. Try a company name or ticker.</p>}
      <div className="stock-index-list">{exhibits.map((a,i) => ({a,i})).filter(({a}) => `${a.name} ${a.symbol} ${a.address}`.toLowerCase().includes(query.toLowerCase().trim())).map(({a,i}) => <div className="stock-index-row" key={a.address}><button onClick={() => fly(i)}><small>{String(i+1).padStart(2,"0")}</small><span>{a.name}<small>{a.symbol} / Fly to asset</small></span></button><button aria-label={`Open ${a.name} report`} onClick={() => {setIndexOpen(false);setSelected(i);}}>↗</button></div>)}</div>
      <p>Explore the canvas, or open a report directly.</p>
    </aside>}
    <dialog ref={dialog} aria-label="Stock research report" className="stock-report-dialog" onCancel={() => setSelected(null)} onClose={() => {setSelected(null);indexButton.current?.focus();}}>
      {selected !== null && <><header><span>{exhibits[selected].name} / Research</span><div><button aria-label="Previous stock" onClick={() => setSelected((selected + exhibits.length - 1) % exhibits.length)}>←</button><button aria-label="Next stock" onClick={() => setSelected((selected+1)%exhibits.length)}>→</button><a href={stockPath(exhibits[selected].address)}>Full report ↗</a><button onClick={() => setSelected(null)}>Close ×</button></div></header>{!reportReady && <p className="stock-report-loading" role="status">Opening {exhibits[selected].name} research…</p>}<iframe key={selected} onLoad={() => setReportReady(true)} title={`${exhibits[selected].name} research report`} src={`${stockPath(exhibits[selected].address)}?embed=1`} /></>}
    </dialog>
  </main>;
}
