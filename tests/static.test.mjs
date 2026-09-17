import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const app=await readFile(new URL("../app.mjs",import.meta.url),"utf8");
const css=await readFile(new URL("../styles.css",import.meta.url),"utf8");

const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,"index.html contains duplicate IDs");

const staticIds=new Set(ids);
const dynamicIds=new Set(["extraInput"]);
const referenced=[...app.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map(match=>match[1]);
for(const id of referenced)assert.ok(staticIds.has(id)||dynamicIds.has(id),`app.mjs references missing #${id}`);

assert.match(html,/href="styles\.css"/);
assert.match(html,/src="app\.mjs"/);
assert.match(css,/\.data-bus\.active/);
console.log("Mini8 static tests: OK");
