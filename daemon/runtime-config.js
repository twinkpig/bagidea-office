"use strict";

const VALID_RUNTIMES = new Set(["claude", "codex", "hermes"]);

function normalizeRuntime(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "claude code") return "claude";
  return VALID_RUNTIMES.has(v) ? v : "";
}

function roleProfileFor(reg, role) {
  const name = String(role || "");
  const profiles = (reg && reg.roleProfiles) || {};
  const p = profiles[name];
  return p && typeof p === "object" ? p : {};
}

function resolveAgentRuntime(reg, agentId) {
  const agents = (reg && reg.agents) || {};
  const a = agents[agentId] || {};
  const role = String(a.role || "");
  const agentRuntime = normalizeRuntime(a.runtime);
  if (agentRuntime) return { runtime: agentRuntime, source: "agent", role };

  const rp = roleProfileFor(reg, role);
  const roleRuntime = normalizeRuntime(rp.runtime);
  if (roleRuntime) return { runtime: roleRuntime, source: "role", role };

  const def = normalizeRuntime(reg && reg.defaultRuntime) || "claude";
  return { runtime: def, source: "default", role };
}

function effectiveAgentRuntime(reg, agentId) {
  return resolveAgentRuntime(reg, agentId).runtime;
}

function runtimeLabel(runtime) {
  const rt = normalizeRuntime(runtime);
  if (rt === "codex") return "Codex";
  if (rt === "hermes") return "Hermes";
  return "Claude Code";
}

module.exports = {
  VALID_RUNTIMES,
  normalizeRuntime,
  roleProfileFor,
  resolveAgentRuntime,
  effectiveAgentRuntime,
  runtimeLabel,
};
