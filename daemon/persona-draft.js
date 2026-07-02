"use strict";

const DRAFT_LANG = {
  en: "English",
  zh: "Simplified Chinese",
  es: "Spanish",
  hi: "Hindi",
  ar: "Arabic",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  de: "German",
  fr: "French",
  ko: "Korean",
  id: "Indonesian",
  vi: "Vietnamese",
  th: "Thai",
};

function personaDraftLanguageName(lang) {
  const key = String(lang || "").trim().toLowerCase();
  return DRAFT_LANG[key] || "the same language as the owner's brief";
}

function buildPersonaDraftPrompt({ name, role, brief, lang, skillMenu, toolMenu }) {
  const outLang = personaDraftLanguageName(lang);
  return `Design a complete persona for an AI agent in a software office, and ` +
    `pick the skills + tools that fit its job.\n` +
    `Agent name: ${name || "Agent"}\nJob title: ${role || "Specialist"}\n` +
    `Owner's brief: ${brief || ""}\n` +
    `Output language: ${outLang}\n\n` +
    `Available SKILLS (pick by id, only ones that truly fit the role):\n${skillMenu || ""}\n\n` +
    `Available TOOLS (pick by exact name, only what the job needs — fewer is better; ` +
    `a manager/coordinator needs very few, a builder needs more):\n${toolMenu || ""}\n\n` +
    `Output STRICT JSON only (no markdown fences):\n` +
    `{"prompt":"core mission & identity, second person, 3-6 sentences",` +
    `"expertise":"bullet-ish lines: concrete skills, tools, domains they own",` +
    `"personality":"tone of voice, character quirks, how they talk",` +
    `"language":"primary reply language in ${outLang}",` +
    `"rules":"3-6 imperative work rules (do/don't), one per line",` +
    `"skills":["skill-id", ...],` +
    `"tools":["ToolName", ...]}\n` +
    `Write these JSON string fields in ${outLang}: prompt, expertise, personality, language, rules. ` +
    `Keep skill ids and tool names verbatim. Every field must genuinely reflect the brief. ` +
    `skills/tools MUST be chosen ONLY from the lists above (exact ids/names).`;
}

module.exports = {
  buildPersonaDraftPrompt,
  personaDraftLanguageName,
};
