const OFFICE_FEED_EVENT_TYPES = new Set([
  "task.started",
  "task.progress",
  "task.completed",
  "task.failed",
  "task.delegated",
  "subagent.progress",
  "subagent.spawned",
  "subagent.done",
  "subagent.split",
  "perm.requested",
  "perm.approved",
  "perm.denied",
  "ceo.summon",
  "ceo.report",
  "collab.started",
  "collab.ended",
  "skill.created",
  "memory.learned",
  "channel.message",
  "proposal.created",
  "proposal.approved",
  "proposal.rejected",
  "voice.say",
  "update.available",
]);

function shouldShowInOfficeFeed(ev) {
  if (!ev || ev.replay || ev.theater) return false;
  if (ev.type === "chat.message") return false;
  if (ev.type === "task.progress") return false;
  if (ev.type === "task.started" && /^📨\s*Report from\b/i.test(String(ev.title || ""))) return false;
  return OFFICE_FEED_EVENT_TYPES.has(ev.type);
}

function shouldShowInThreadLog(row) {
  if (!row) return false;
  if (row.social || row.ambient) return false;
  return true;
}

const api = {
  shouldShowInOfficeFeed,
  shouldShowInThreadLog,
  OFFICE_FEED_EVENT_TYPES,
};

if (typeof module !== "undefined") module.exports = api;
if (typeof window !== "undefined") window.BagideaActivityFilter = api;
