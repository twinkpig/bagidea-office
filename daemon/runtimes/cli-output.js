"use strict";

function normalizeCliText(text) {
  return String(text || "").replace(/\0/g, "");
}

function isWslWarningLine(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (/^wsl:/i.test(s)) return true;
  if (/localhost/i.test(s) && /WSL/i.test(s) && /NAT/i.test(s)) return true;
  if (/检测到.*localhost.*WSL.*NAT/i.test(s)) return true;
  return false;
}

function cleanCliDiagnostic(text, options = {}) {
  const dropShellInitErrors = options.dropShellInitErrors !== false;
  const lines = normalizeCliText(text).split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const kept = lines.filter((line) => {
    if (isWslWarningLine(line)) return false;
    if (/^Command failed:\s*wsl\.exe\b/i.test(line)) return false;
    if (dropShellInitErrors && /source: not found/i.test(line)) return false;
    return true;
  });
  return kept.join("\n").trim();
}

function parseVersionOutput(text, matchers) {
  const lines = cleanCliDiagnostic(text, { dropShellInitErrors: true })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const patterns = Array.isArray(matchers) ? matchers : [matchers].filter(Boolean);
  return lines.find((line) => patterns.some((re) => re.test(line))) || lines[0] || "";
}

module.exports = {
  cleanCliDiagnostic,
  isWslWarningLine,
  normalizeCliText,
  parseVersionOutput,
};
