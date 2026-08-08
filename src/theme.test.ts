import assert from "node:assert/strict";
import { DEFAULT_THEME_PREFERENCE, isThemePreference, resolveTheme } from "./theme";

assert.equal(DEFAULT_THEME_PREFERENCE, "dark");

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
