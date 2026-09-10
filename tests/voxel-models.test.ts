import assert from "node:assert/strict";
import { createStockModel } from "../src/features/stocks/voxel/models";
import { STOCKS } from "../src/features/stocks/catalog";

const signatures=new Set<string>();
for(let i=0;i<STOCKS.length;i++) {
  const model=createStockModel(i);
  assert(model.name && model.accent,`Missing art direction for ${STOCKS[i].symbol}`);
  assert(model.voxels.length>100 && model.voxels.length<6000,"Keep instanced geometry bounded");
  for(const v of model.voxels) {
    assert([v.x,v.y,v.z,v.w,v.h,v.d].every(Number.isFinite));
    assert(v.w>0 && v.h>0 && v.d>0);
    assert(Math.abs(v.x)+v.w/2<12 && Math.abs(v.z)+v.d/2<12,"Object should fit its viewport");
    assert(v.y+v.h/2<13 && v.y-v.h/2> -5);
    assert.match(v.color,/^#[0-9a-f]{6}$/i);
  }
  assert.deepEqual(createStockModel(i),model,"Models must remain deterministic across rendering paths");
  signatures.add(JSON.stringify(model.voxels));
}
assert.equal(signatures.size,STOCKS.length,"Each stock needs a distinct object");
console.log("13 unique voxel models: deterministic, valid geometry and bounded rendering cost.");
