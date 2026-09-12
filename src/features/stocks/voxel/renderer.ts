import * as THREE from "three128";
import { createStockModel, OBJECT_WIDTH, OBJECT_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, type StockModel } from "./models";
import { renderModelFallback } from "./fallback";

export type GalleryCamera = { x:number; y:number; z:number };
export type VoxelRenderer = ReturnType<typeof createVoxelGalleryRenderer>;
const positions=Array.from({length:13},(_,i)=>({x:750+i%4*1450,y:620+Math.floor(i/4)*1050}));

export function createVoxelGalleryRenderer(canvas: HTMLCanvasElement) {
  let gl: THREE.WebGLRenderer | undefined;
  // Probe this canvas once. The fallback uses a separate canvas because context types cannot change.
  let context: WebGLRenderingContext | null = null;
  try { context=canvas.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:true}); } catch { /* software path */ }
  if(context) {
    try {
      gl=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true});
      gl.setPixelRatio(Math.min(window.devicePixelRatio,window.matchMedia("(pointer:coarse)").matches?1.25:1.75));
      gl.outputEncoding=THREE.sRGBEncoding;
      gl.toneMapping=THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure=1.15;
      gl.physicallyCorrectLights=true;
      gl.shadowMap.enabled=true;
      gl.shadowMap.type=THREE.PCFSoftShadowMap;
      gl.setClearColor(0x000000,0);
      gl.autoClear=false;
    } catch {gl?.dispose();gl=undefined;}
  }
  const fallbackCanvas=gl?undefined:document.createElement("canvas");
  if(fallbackCanvas) {fallbackCanvas.className="stock-voxel-software";canvas.after(fallbackCanvas);canvas.hidden=true;}
  const ctx=fallbackCanvas?.getContext("2d");
  // Shared world-space infrastructure stays aligned with both rendering paths.
  const network=document.createElement("canvas");
  network.className="stock-district-network";network.setAttribute("aria-hidden","true");canvas.before(network);
  const networkContext=network.getContext("2d");
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  let networkFrame=-1,hoverStrength=0;
  const models=new Map<number,StockModel>();
  const sprites=new Map<number,HTMLCanvasElement>();
  const scenes=new Map<number,{scene:THREE.Scene;group:THREE.Group;materials:THREE.Material[];key:THREE.DirectionalLight;fill:THREE.HemisphereLight}>();
  const cube=new THREE.BoxGeometry(1,1,1);
  const camera=new THREE.OrthographicCamera(-15.5,15.5,15.5*OBJECT_HEIGHT/OBJECT_WIDTH,-15.5*OBJECT_HEIGHT/OBJECT_WIDTH,.1,150);
  camera.position.set(28,24,32);camera.lookAt(0,3,0);
  let width=0,height=0,dirty=true,last="";
  const model=(i:number)=>{if(!models.has(i))models.set(i,createStockModel(i));return models.get(i)!;};
  function sceneFor(i:number) {
    if(scenes.has(i))return scenes.get(i)!;
    const source=model(i),scene=new THREE.Scene(),group=new THREE.Group(),materials:THREE.Material[]=[];
    const batches=new Map<string,typeof source.voxels>();
    for(const v of source.voxels){const k=`${v.color}/${v.metal??0}/${v.glow??0}`;if(!batches.has(k))batches.set(k,[]);batches.get(k)!.push(v);}
    const transform=new THREE.Object3D();
    for(const voxels of batches.values()) {
      const v=voxels[0];
      const material=new THREE.MeshStandardMaterial({color:v.color,metalness:v.metal??.2,roughness:v.glow ? .4 : .72,emissive:v.glow?v.color:0x000000,emissiveIntensity:v.glow??0});
      materials.push(material);
      const mesh=new THREE.InstancedMesh(cube,material,voxels.length);
      voxels.forEach((v,j)=>{transform.position.set(v.x,v.y,v.z);transform.scale.set(v.w,v.h,v.d);transform.updateMatrix();mesh.setMatrixAt(j,transform.matrix)});
      mesh.castShadow=!v.glow;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);
    }
    scene.add(group);
    const fill=new THREE.HemisphereLight(0x91bdc8,0x302a23,.9);scene.add(fill);
    const key=new THREE.DirectionalLight(0xffe4c0,3.1);key.position.set(-8,18,10);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=15;key.shadow.camera.bottom=-15;key.shadow.camera.near=.5;key.shadow.camera.far=60;key.shadow.normalBias=.06;key.shadow.bias=-.0001;
    scene.add(key);
    const rim=new THREE.DirectionalLight(0x78c9dc,1.8);rim.position.set(8,9,-12);scene.add(rim);
    const practical=new THREE.PointLight(0xffba73,65,18,2);practical.position.set(-3,4,6);scene.add(practical);
    const cool=new THREE.PointLight(0x69dcdf,35,14,2);cool.position.set(4,6,-3);scene.add(cool);
    const result={scene,group,materials,key,fill};scenes.set(i,result);return result;
  }
  function resize(w:number,h:number) {
    if(w===width && h===height)return;
    width=w;height=h;dirty=true;
    gl?.setSize(w,h,false);
    const networkDpr=Math.min(window.devicePixelRatio,1.5);
    network.width=Math.round(w*networkDpr);network.height=Math.round(h*networkDpr);
    networkContext?.setTransform(networkDpr,0,0,networkDpr,0,0);
    if(fallbackCanvas){const dpr=Math.min(window.devicePixelRatio,1.5);fallbackCanvas.width=Math.round(w*dpr);fallbackCanvas.height=Math.round(h*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);}
  }
  function render(view:GalleryCamera,w:number,h:number,dark:boolean,hover:number,lean:number,selected:number) {
    resize(w,h);
    const tick=reduced.matches?0:Math.floor(performance.now()/50);
    const focus=selected>=0?selected:hover;
    const cameraSignature=[view.x.toFixed(2),view.y.toFixed(2),view.z.toFixed(4),dark,hover,selected,lean.toFixed(3)].join('/');
    if(networkContext && (dirty||tick!==networkFrame||!last.startsWith(cameraSignature))) {
      networkFrame=tick;
      const n=networkContext;n.clearRect(0,0,w,h);
      n.strokeStyle=dark?"#67a8c00c":"#183e5315";n.lineWidth=1;
      const spacing=180*view.z;
      if(spacing>24) {
        const ox=((w/2-view.x*view.z)%spacing+spacing)%spacing;
        const oy=((h/2-view.y*view.z)%spacing+spacing)%spacing;
        n.beginPath();for(let x=ox;x<w;x+=spacing){n.moveTo(x,0);n.lineTo(x,h)}
        for(let y=oy;y<h;y+=spacing){n.moveTo(0,y);n.lineTo(w,y)}n.stroke();
      }
      for(let rx=-1;rx<=1;rx++)for(let ry=-1;ry<=1;ry++)positions.forEach((a,i)=>{
        for(const j of [i%4<3?i+1:-1,i+4]) {
          if(j<0||j>=positions.length)continue;
          const b=positions[j];
          const x=w/2+(a.x+rx*WORLD_WIDTH-view.x)*view.z;
          const y=h/2+(a.y+ry*WORLD_HEIGHT-view.y+175)*view.z;
          const bx=x+(b.x-a.x)*view.z,by=y+(b.y-a.y)*view.z;
          if(Math.max(x,bx)<-100||Math.min(x,bx)>w+100||Math.max(y,by)<-100||Math.min(y,by)>h+100)continue;
          const active=focus===i||focus===j;
          n.strokeStyle=dark?(active?"#64caff80":"#3875a033"):(active?"#0052ff99":"#295d7738");
          n.lineWidth=active?1.5:1;n.beginPath();n.moveTo(x,y);n.lineTo(bx,by);n.stroke();
          const t=reduced.matches?.5:((tick*.005+i*.17)%1);
          n.fillStyle=dark?(active?"#a3e6ff":"#72acd0") : "#0052ff";
          n.shadowColor="#0052ff";n.shadowBlur=active?12:4;
          n.fillRect(x+(bx-x)*t-2,y+(by-y)*t-2,4,4);n.shadowBlur=0;
        }
      });
      if(focus>=0) for(let rx=-1;rx<=1;rx++)for(let ry=-1;ry<=1;ry++) {
        const a=positions[focus];
        const x=w/2+(a.x+rx*WORLD_WIDTH-view.x)*view.z;
        const y=h/2+(a.y+ry*WORLD_HEIGHT-view.y+175)*view.z;
        if(x<-160||x>w+160||y<-240||y>h+160)continue;
        const pulse=reduced.matches?.55:.35+.2*Math.sin(tick*.2);
        n.strokeStyle=dark?`rgba(81,205,255,${pulse})`:`rgba(0,82,255,${pulse})`;
        n.lineWidth=1.5;n.shadowColor=dark?"#24c8ff":"#0052ff";n.shadowBlur=18;
        n.beginPath();n.ellipse(x,y,Math.max(28,220*view.z),Math.max(8,48*view.z),0,0,Math.PI*2);n.stroke();
        n.beginPath();n.moveTo(x,y);n.lineTo(x,y-Math.max(80,260*view.z));n.stroke();
        n.fillStyle=dark?"#b6eeff":"#0052ff";n.beginPath();n.arc(x,y-Math.max(80,260*view.z),3.5,0,Math.PI*2);n.fill();n.shadowBlur=0;
      }
    }
    hoverStrength=reduced.matches?0:hoverStrength+((hover>=0?1:0)-hoverStrength)*.12;
    const signature=cameraSignature+"/"+hoverStrength.toFixed(2);
    if(!dirty && last===signature)return;
    last=signature;dirty=false;
    if(gl){gl.setScissorTest(false);gl.setViewport(0,0,width,height);gl.clear(true,true,true);gl.setScissorTest(true);}
    ctx?.clearRect(0,0,width,height);
    for(let rx=-1;rx<=1;rx++)for(let ry=-1;ry<=1;ry++)positions.forEach((position,i)=>{
      const x=width/2+(position.x+rx*WORLD_WIDTH-view.x-OBJECT_WIDTH/2)*view.z;
      const y=height/2+(position.y+ry*WORLD_HEIGHT-view.y-OBJECT_HEIGHT/2)*view.z;
      const vw=OBJECT_WIDTH*view.z,vh=OBJECT_HEIGHT*view.z;
      if(x>width||y>height||x+vw<0||y+vh<0)return;
      if(gl) {
        const item=sceneFor(i);
        item.group.rotation.y=hover===i?lean*.22:0;
        item.group.position.y=focus===i?Math.max(hoverStrength,.55)*.35:0;
        item.group.scale.setScalar(focus===i?1+Math.max(hoverStrength,.55)*.035:1);
        item.key.intensity=dark?(focus===i?3.75:3.1):focus===i?3.45:3.1;
        item.fill.intensity=dark ? .9 : 1.3;
        const left=Math.max(0,x),bottom=Math.max(0,height-y-vh);
        gl.setViewport(x,height-y-vh,vw,vh);
        gl.setScissor(left,bottom,Math.max(0,Math.min(width,x+vw)-left),Math.max(0,Math.min(height,height-y)-bottom));
        gl.render(item.scene,camera);
      } else if(ctx) {
        if(!sprites.has(i))sprites.set(i,renderModelFallback(model(i)));
        const strength=focus===i?Math.max(hoverStrength,.55):0;
        const lift=strength*7*view.z;
        const scale=1+strength*.035;
        ctx.drawImage(sprites.get(i)!,x-vw*(scale-1)/2,y-vh*(scale-1)/2-lift,vw*scale,vh*scale);
      }
    });
    gl?.setScissorTest(false);
  }
  function dispose() {
    for(const s of scenes.values()){s.materials.forEach(m=>m.dispose());(s.key.shadow.map as THREE.WebGLRenderTarget|null)?.dispose();s.scene.clear();}
    cube.dispose();gl?.dispose();fallbackCanvas?.remove();network.remove();sprites.clear();scenes.clear();models.clear();
  }
  return {render,dispose,mode:gl?"webgl":"software",invalidate:()=>{dirty=true}};
}
