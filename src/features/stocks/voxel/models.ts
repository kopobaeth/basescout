export type Voxel = { x: number; y: number; z: number; w: number; h: number; d: number; color: string; metal?: number; glow?: number };
export type StockModel = { name: string; accent: string; voxels: Voxel[] };
export const OBJECT_WIDTH = 840;
export const OBJECT_HEIGHT = 640;
export const WORLD_WIDTH = 6000;
export const WORLD_HEIGHT = 4200;
const concrete = ["#505b60", "#566166", "#434f55", "#60696c"];
const steel = "#26383e", dark = "#18262d", ivory = "#c0c6bf", cyan = "#73d9da", amber = "#f1a65b";

// Authored, deterministic object geometry. Both rendering paths consume these boxes.
export function createStockModel(index: number): StockModel {
  const voxels: Voxel[] = [];
  const accents = [cyan, amber, "#739aff", "#6ee1b0", "#f0ca75", cyan, "#b2a2eb", "#92bed4", amber, "#a8d778", "#ef8474", ivory, "#ed8274"];
  const accent = accents[index];
  const box = (x:number,y:number,z:number,w:number,h:number,d:number,color=steel,metal=.25,glow=0) => voxels.push({x,y,z,w,h,d,color,metal,glow});
  const block = (x:number,y:number,z:number,w:number,h:number,d:number,color=steel,step=.5) => {
    for(let a=0;a<w;a+=step) for(let b=0;b<h;b+=step) for(let c=0;c<d;c+=step) {
      // Surface voxels only: an enclosed volume does not need invisible interior cubes.
      if(a>0&&a+step<w&&b>0&&b+step<h&&c>0&&c+step<d)continue;
      const dw=Math.min(step,w-a),dh=Math.min(step,h-b),dd=Math.min(step,d-c);
      box(x-w/2+a+dw/2,y+b+dh/2,z-d/2+c+dd/2,dw*.985,dh*.985,dd*.985,color);
    }
  };
  const lamp = (x:number,y:number,z:number,w=1,color=accent) => box(x,y,z,w,.22,.24,color,.1,1.8);
  const tower = (x:number,z:number,w:number,d:number,h:number,color=steel) => {
    block(x,.65,z,w,h,d,color,.5);
    box(x,h+.9,z,w+.5,.35,d+.5,concrete[1]);
    for(let y=2;y<h;y+=1.7) for(let a=-w/2+.65;a<w/2;a+=1.3) lamp(x+a,y,z+d/2+.03,.55);
    box(x,h+1.3,z,1.8,.55,1.5,dark);
    for(let a=-.6;a<.7;a+=.4) box(x+a,h+1.6,z,.15,.13,1.2,concrete[2]);
  };
  // Broken concrete foundation, individually modelled paving and exposed substructure.
  for(let x=-8;x<=8;x+=2) for(let z=-6;z<=6;z+=2) {
    if(Math.abs(x)===8 && Math.abs(z)===6) continue;
    const k=Math.abs(x*7+z*13+index*3);
    box(x,-.15,z,1.96,1.3+(k%3)*.12,1.96,concrete[k%4],.1);
    box(x,.59,z,1.91,.12,1.91,k%5===0?"#364b51":"#657072",.28);
    if(z===6 && x%4===0) box(x,-1,z-.4,1.3,.8,1.3,dark);
  }
  for(let x=-6;x<=6;x+=2) box(x,.69,5.5,.9,.06,.2,amber,.1,.15);
  // Pipes, safety bollards, service lamps and small rubble establish a shared world.
  for(const x of [-7,7]) {
    box(x,1.15,4.3,.35,.9,.35,amber);
    box(x,1.4,-4.8,.5,1.6,.5,steel);
    lamp(x,2.25,-4.8,.7,cyan);
  }
  for(let i=0;i<5;i++) box(-6+i*.65,.85,-5.2,.45,.4,.45,concrete[i%4]);
  // Weathered undercroft, copper service conduits and rooftop-scale details.
  for(let x=-7;x<=7;x++)for(let z=-5;z<=5;z++) {
    const k=Math.abs(x*17+z*29+index*7);
    if(Math.abs(x)<6&&Math.abs(z)<4)continue;
    if(k%7===0)continue;
    const depth=1+(k%4)*.4;
    box(x,-1-depth/2,z,.95,depth,.95,concrete[k%4],.12);
    if(k%5===0)box(x,-1.3,z+.48,.18,.7,.08,amber,.55,.7);
  }
  for(let z=-4;z<5;z+=.5) {
    box(-6.4,.86,z,.16,.2,.48,"#a98459",.7);
    if(z%2===0)box(-6.4,1.05,z,.35,.15,.25,steel,.65);
  }
  for(let x=-6;x<=6;x+=2) {
    box(x,1.5,-5.5,.13,1.6,.13,"#86938e",.7);
    box(x,2.2,-5.5,1.9,.1,.1,"#86938e",.7);
  }
  const names = ["Consumer technology", "Automated fulfilment", "Exchange vault", "Settlement reactor", "Information archive", "Silicon foundry", "Immersive network", "Cloud infrastructure", "Digital treasury", "Compute engine", "Memory archive", "Orbital launchpad", "Electric mobility"];

  switch(index) {
    case 0: { // Apple: monumental terminal, device and keyboard.
      block(-2,1,-.5,7,6,4,ivory);
      box(-2,4.6,1.57,5.8,3.9,.15,dark,.5);
      box(-2,4.65,1.68,5,3.1,.08,"#417d83",.4,.22);
      for(let a=0;a<7;a++) {
        const h=.5+(a*7%5)*.35;
        box(-4+a*.65,3.2+h/2,1.86,.42,h,.2,"#36585d",.4);
        lamp(-4+a*.65,3.2+h,1.99,.23,amber);
      }
      box(-2,1.4,3,6,.4,2.1,ivory);
      for(let x=-4;x<=0;x+=.55) for(let z=2.5;z<3.8;z+=.55) box(x,1.66,z,.4,.1,.4,steel);
      block(4,1,-1,2,8,1,ivory,.5);
      box(4,5,-.45,1.65,6.8,.15,dark,.6);
      lamp(4,7.8,-.34,1.2,cyan);
      tower(4,2.8,2,2,2.5);
      tower(-5.5,-2,1.5,2,3.5);tower(5,-3.7,1.5,1.5,4);
      break;
    }
    case 1: { // Amazon: warehouse, cargo, conveyor, industrial robot.
      tower(-2,-2,7,5,6,"#64706a");
      box(-2,2.3,.55,4,3.2,.16,dark);
      for(let x=-3.5;x<0;x+=.65) lamp(x,4,.67,.42,amber);
      box(0,1.25,3,10,.55,2.2,steel,.65);
      for(let x=-4.5;x<5;x+=.55) box(x,1.6,3,.3,.15,1.9,"#7c8783",.7);
      for(let x=-3;x<=3;x+=2) {block(x,1.8,3,1.5,1.5,1.5,"#b97d48",.5);box(x,3.32,3,.25,.05,1.5,ivory);}
      block(5,.8,-1,2,2,2,"#c68447"); block(5,2.8,-1,1,3,1,"#ca8b4c",.5);
      block(3.6,5.5,-1,3.8,1,1,"#ca8b4c",.5); block(2.2,4.2,-1,.5,1.4,.5,steel,.5);
      for(const x of [-3.5,-.5]) {box(x,7.5,-3,1.4,1.7,1.4,concrete[2]);box(x,8.5,-3,1,.3,1,dark);}
      for(let x=-5;x<3;x+=1.5) {box(x,1.5,4.6,.13,1.5,.13,"#b99561");box(x,2.15,4.6,1.4,.1,.1,"#b99561");}
      break;
    }
    case 2: { // Coinbase: secure blue exchange vault.
      tower(-1,-1,9,5,7,"#3b5274");
      block(-1,1,2,6,6,1,"#8a9caa");
      box(-1,4,2.6,4.6,4.6,.3,dark,.7);
      for(let a=0;a<12;a++){const t=a*Math.PI/6;box(-1+Math.round(Math.cos(t)*1.7)*.8,4+Math.round(Math.sin(t)*1.7)*.8,2.9,.75,.75,.4,"#6c9ecb",.7);}
      box(-1,4,3.2,2.3,.35,.35,accent,.6,.3);
      tower(5,-1,2,3,4);
      break;
    }
    case 3: { // Circle: cubic industrial torus, settlement core.
      for(let a=0;a<24;a++){const t=a*Math.PI/12;const x=Math.round(Math.cos(t)*4),y=5+Math.round(Math.sin(t)*4);box(x,y,-1,1.15,1.15,2,"#78958b",.65);box(x,y,.08,.55,.55,.12,accent,.15,1.3);}
      block(-4,.8,-1,2,2,3,steel);block(4,.8,-1,2,2,3,steel);
      block(0,3.6,-1,2,2,2,"#476f60",.5);lamp(0,4.6,.2,1.4,accent);
      break;
    }
    case 4: { // Alphabet: multicolour data archive towers.
      const colors=["#789aa9","#ab7767","#c2a16b","#789581"];
      colors.forEach((c,i)=>tower(-4.5+i*3, i%2 ? -2:0,2,3,4+i%3*2,c));
      box(0,1,4,10,.5,1.2,steel);for(let x=-4;x<5;x+=.8)lamp(x,1.35,4,.4,cyan);
      break;
    }
    case 5: case 9: { // Intel / NVIDIA: different chip foundry geometry.
      const c=index===9?"#63824c":"#4d7e93";
      block(0,1,0,9,1,8,c);block(0,2,0,5,2,4,steel);
      block(0,4,0,3,1,3,index===9?"#90ad6c":"#83b4c1",.5);
      for(let x=-4;x<=4;x+=1) for(const z of [-4.8,4.8])box(x,1,z,.35,.3,1.4,"#b3a275",.9);
      for(let z=-3;z<=3;z++)for(const x of [-5,5])box(x,1,z,1.3,.3,.35,"#b3a275",.9);
      for(let x=-2;x<=2;x+=.65)box(x,5.5,0,.26,1,3.2,ivory,.8);
      tower(-5.5,-3,2,2,index===9?5:3,c); lamp(0,3,2.05,3,accent);
      break;
    }
    case 6: { // Meta: voxel headset, network pylons.
      block(0,2,0,9,3,4,"#8790a5");
      for(const x of [-2.5,2.5]) {block(x,2.5,2.1,3,2,1,dark,.5);lamp(x,3.5,2.7,2,accent);}
      block(0,1,0,3,1,3,steel);
      tower(-5,-3,2,2,6,"#6f6786");tower(5,-3,2,2,6,"#6f6786");
      box(0,6.5,-3,10,.5,.5,accent,.4,.3);break;
    }
    case 7: { // Microsoft: four cloud stacks.
      for(let i=0;i<4;i++)tower(i%2?3:-3,i<2?-2:2,3,3,i<2?8:4.5,["#927565","#778967","#698b9b","#aaa078"][i]);
      box(0,1.2,0,1,1,8,steel);for(let z=-3;z<4;z++)lamp(0,1.75,z,.5,cyan);
      break;
    }
    case 8: { // Strategy: armoured digital treasury.
      tower(0,-1,8,5,6,"#66574b");
      block(0,2,1.6,5,4,1,"#bba474");
      for(let x=-1.5;x<=1.5;x+=1.5)block(x,1,3.5,1,1,1,"#c6a66b",.5);
      for(let y=3;y<6;y++)lamp(0,y,2.2,3,amber);break;
    }
    case 10: { // SanDisk: red memory cartridge in an archive dock.
      block(-1,1,-1,6,8,2,"#9d5b52");block(-1,1,-1,6,3,2,steel);
      for(let x=-3;x<=1;x+=.8)box(x,8.9,-.1,.45,1.2,.15,"#cdb17b",.8);
      box(-1,5.5,.1,4,2,.16,ivory);lamp(-1,5.5,.21,2.5,amber);
      tower(4,1,3,3,4);break;
    }
    case 11: { // SPCX: voxel launch vehicle and service gantry.
      block(0,1,0,3,7,3,ivory);
      block(0,8,0,2,2,2,ivory);block(0,10,0,1,1,1,ivory);
      block(-2,1,0,1,3,2,steel);block(2,1,0,1,3,2,steel);
      for(let y=1;y<10;y+=2){box(-4,y,-1,1,1.8,1,steel);box(-3,y,-1,2,.35,.5,steel);}
      lamp(0,1,1.8,2.3,amber);break;
    }
    case 12: { // Tesla: angular vehicle, charging station and battery.
      block(0,1.5,1,9,2,4,"#9ba6a5",.5);block(-.5,3.5,1,5,1,3,"#aeb8b4",.5);
      box(-.5,3.8,2.6,4,.7,.15,"#25414a",.65);
      for(const x of [-2.8,2.8]) for(const z of [-1.1,3.1])block(x,1,z,1.5,1.5,.6,dark,.5);
      lamp(4.55,2.8,1,1,ivory);tower(-4,-3,2,2,5,"#a85e55");tower(3,-3,3,2,3.5);
      break;
    }
  }
  return { name:names[index], accent, voxels };
}
