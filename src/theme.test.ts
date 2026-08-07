import assert from "node:assert/strict";
import { isThemePreference, resolveTheme } from "./theme";

assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("light", true), "light");

assert.equal(isThemePreference("system"), true);
assert.equal(isThemePreference("dark"), true);
assert.equal(isThemePreference("light"), true);
assert.equal(isThemePreference("sepia"), false);
assert.equal(isThemePreference(null), false);

console.log("Theme preference tests passed");
