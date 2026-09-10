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
    if(fallbackCanvas){const dpr=Math.min(window.devicePixelRatio,1.5);fallbackCanvas.width=Math.round(w*dpr);fallbackCanvas.height=Math.round(h*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);}
  }
  function render(view:GalleryCamera,w:number,h:number,dark:boolean,hover:number,lean:number) {
    resize(w,h);
    const signature=[view.x.toFixed(2),view.y.toFixed(2),view.z.toFixed(4),dark,hover,lean.toFixed(3)].join('/');
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
        item.fill.intensity=dark ? .9 : 1.3;
        const left=Math.max(0,x),bottom=Math.max(0,height-y-vh);
        gl.setViewport(x,height-y-vh,vw,vh);
        gl.setScissor(left,bottom,Math.max(0,Math.min(width,x+vw)-left),Math.max(0,Math.min(height,height-y)-bottom));
        gl.render(item.scene,camera);
      } else if(ctx) {
        if(!sprites.has(i))sprites.set(i,renderModelFallback(model(i)));
        ctx.drawImage(sprites.get(i)!,x,y,vw,vh);
      }
    });
    gl?.setScissorTest(false);
  }
  function dispose() {
    for(const s of scenes.values()){s.materials.forEach(m=>m.dispose());(s.key.shadow.map as THREE.WebGLRenderTarget|null)?.dispose();s.scene.clear();}
    cube.dispose();gl?.dispose();fallbackCanvas?.remove();sprites.clear();scenes.clear();models.clear();
  }
  return {render,dispose,mode:gl?"webgl":"software",invalidate:()=>{dirty=true}};
}
