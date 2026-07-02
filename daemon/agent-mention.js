function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function resolveAgentMention(name, agents) {
  const key = normalize(name);
  if (!key || !agents || typeof agents !== "object") return "";
  if (agents[key] && key !== "ceo" && key !== "main") return key;
  return Object.keys(agents).find((id) =>
    id !== "ceo" && id !== "main" &&
    normalize((agents[id] || {}).name) === key) || "";
}

function parseAgentMentionShortcut(text, agents) {
  const raw = String(text || "");
  const m = raw.match(/^\s*@([^\s:：@]+)\s+([\s\S]+?)\s*$/);
  if (!m) return null;
  const agent = resolveAgentMention(m[1], agents);
  if (!agent) return null;
  const instruction = m[2].trim();
  if (!instruction) return null;
  return { agent, instruction };
}

module.exports = {
  parseAgentMentionShortcut,
  resolveAgentMention,
};
