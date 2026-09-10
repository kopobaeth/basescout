import { type StockModel, OBJECT_WIDTH, OBJECT_HEIGHT } from "./models";

// A deterministic software projection of the same 3D boxes, used without WebGL.
// It is a static rendering path, not a replacement model or generated stock card.
type Point = [number, number, number];
const project = ([x,y,z]:Point):[number,number] => [OBJECT_WIDTH/2+(x-z)*22,OBJECT_HEIGHT*.61+(x+z)*10.5-y*27];
function shade(hex:string, amount:number, glow=0) {
  const n=parseInt(hex.slice(1),16);
  return `rgb(${[n>>16,(n>>8)&255,n&255].map(c=>Math.min(255,Math.round(c*(amount+glow*.2)))).join(',')})`;
}
export function renderModelFallback(model: StockModel): HTMLCanvasElement {
  const canvas=document.createElement("canvas");canvas.width=OBJECT_WIDTH;canvas.height=OBJECT_HEIGHT;
  const ctx=canvas.getContext("2d")!;
  // Broad ground shadow plus a tighter contact shadow, separate from object faces.
  ctx.save();ctx.translate(420,515);ctx.scale(1,.26);
  const shadow=ctx.createRadialGradient(0,0,10,0,0,310);
  shadow.addColorStop(0,"rgba(0,0,0,.65)");shadow.addColorStop(.65,"rgba(0,0,0,.28)");shadow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=shadow;ctx.beginPath();ctx.arc(0,0,310,0,Math.PI*2);ctx.fill();ctx.restore();
  const faces:{points:Point[];depth:number;color:string;glow:number}[]=[];
  for(const v of model.voxels) {
    const x=v.x-v.w/2,X=v.x+v.w/2,y=v.y-v.h/2,Y=v.y+v.h/2,z=v.z-v.d/2,Z=v.z+v.d/2;
    const add=(points:Point[],lit:number)=>faces.push({points,depth:points.reduce((n,p)=>n+p[0]+p[2]+p[1]*.8,0)/4,color:shade(v.color,lit,v.glow),glow:v.glow??0});
    add([[x,Y,z],[x,Y,Z],[X,Y,Z],[X,Y,z]],1.07);
    add([[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],.67);
    add([[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]],.43);
  }
  faces.sort((a,b)=>a.depth-b.depth);
  for(const f of faces) {
    ctx.beginPath();f.points.forEach((p,i)=>{const q=project(p);if(i===0)ctx.moveTo(...q);else ctx.lineTo(...q)});ctx.closePath();
    ctx.fillStyle=f.color;ctx.fill();
    ctx.strokeStyle="rgba(10,19,21,.08)";ctx.lineWidth=.4;ctx.stroke();
    if(f.glow) {ctx.save();ctx.globalAlpha=.45;ctx.shadowColor=f.color;ctx.shadowBlur=9;ctx.fill();ctx.restore();}
  }
  return canvas;
}
