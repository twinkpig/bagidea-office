#!/usr/bin/env bash
# Install trading-skills for Claude Code
# https://github.com/VictorVVedtion/trading-skills
set -euo pipefail

REPO="https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main"
SKILLS_DIR="${HOME}/.claude/skills"

MASTERS=(jesse-livermore george-soros warren-buffett benjamin-graham jim-simons sun-tzu satoshi-nakamoto john-von-neumann)
TOOLS=(pre-trade-gate tilt-detector)

echo ""
echo "  trading-skills installer"
echo "  ========================"
echo ""

# Check for curl
if ! command -v curl &>/dev/null; then
  echo "Error: curl is required. Install it and try again."
  exit 1
fi

# Create base directory
mkdir -p "${SKILLS_DIR}"

echo "  Installing 8 legendary master advisors..."
echo ""

for m in "${MASTERS[@]}"; do
  mkdir -p "${SKILLS_DIR}/${m}"
  if curl -fsSL "${REPO}/skills/masters/${m}/SKILL.md" > "${SKILLS_DIR}/${m}/SKILL.md" 2>/dev/null; then
    echo "    ${m}"
  else
    echo "    ${m} (failed)"
  fi
done

echo ""
echo "  Installing 2 risk tools..."
echo ""

for t in "${TOOLS[@]}"; do
  mkdir -p "${SKILLS_DIR}/${t}"
  if curl -fsSL "${REPO}/skills/${t}/SKILL.md" > "${SKILLS_DIR}/${t}/SKILL.md" 2>/dev/null; then
    echo "    ${t}"
  else
    echo "    ${t} (failed)"
  fi
done

echo ""
echo "  Done. 10 trading skills installed to ~/.claude/skills/"
echo ""
echo "  Open Claude Code in any project to activate them."
echo "  Full experience: https://github.com/VictorVVedtion/vibe-sensei"
echo ""
