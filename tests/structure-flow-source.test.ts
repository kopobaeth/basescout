import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const vendor = new URL("vendor/threeui-40eb5bac81e3/", root);
const hashes = JSON.parse(readFileSync(new URL("manifest.json", vendor), "utf8")) as Record<string, string>;
for (const [path, hash] of Object.entries(hashes)) {
  assert.equal(createHash("sha256").update(readFileSync(new URL(path, vendor))).digest("hex"), hash, path);
}
for (const path of ["src/shaders/structure-flow/structureFlowRenderer.ts", "src/shaders/structure-flow/three128.d.ts"]) {
  assert.equal(createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex"), hashes[path], `Live authored source: ${path}`);
}
console.log("All five supplied ThreeUI sources and live renderer match their SHA-256 hashes.");
