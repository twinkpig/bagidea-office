const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const overlay = fs.readFileSync(path.join(root, "daemon", "overlay.html"), "utf8");
const shellMain = fs.readFileSync(path.join(root, "shell", "src", "main.rs"), "utf8");

test("@ mention menu shows effective runtime/provider tag", () => {
  assert.match(overlay, /function mentionRuntimeTag\(id\)/);
  assert.match(overlay, /runtimeTag:\s*mentionRuntimeTag\(id\)/);
  assert.match(overlay, /<span class="mrun">\$\{esc\(a\.runtimeTag\)\}<\/span>/);
});

test("chat chrome keeps only fullscreen and hide window controls", () => {
  assert.match(overlay, /id="fullBtn"/);
  assert.match(overlay, /id="hideBtn"/);
  assert.doesNotMatch(overlay, /id="miniBtn"/);
  assert.doesNotMatch(overlay, /shellPost\("mini"\)/);
});

test("office feed window is slightly larger", () => {
  assert.match(shellMain, /const FEED_W:\s*f64\s*=\s*360\.0;/);
  assert.match(shellMain, /logical_h \* 0\.56\)\.clamp\(360\.0,\s*620\.0\)/);
});

test("main chat opens in fullscreen mode by default", () => {
  assert.match(shellMain, /let mut overlay_fullscreen = true;/);
  assert.match(shellMain, /window\.setFullscreenMode && setFullscreenMode\(true\)/);
});

test("chat bubbles show roster display names instead of uppercased ids", () => {
  assert.doesNotMatch(overlay, /document\.createTextNode\(who\.toUpperCase\(\)\)/);
  assert.match(overlay, /document\.createTextNode\(nameOf\(String\(who\)\.split\("#"\)\[0\]\)\)/);
});
