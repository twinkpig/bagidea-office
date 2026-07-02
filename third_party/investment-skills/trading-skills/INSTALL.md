# Installation

## Method 1: One-liner (installs all 10 skills)

```bash
curl -fsSL https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main/install.sh | bash
```

## Method 2: Pick individual skills

```bash
# Create the skill directory and download
mkdir -p ~/.claude/skills/warren-buffett
curl -fsSL https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main/skills/masters/warren-buffett/SKILL.md \
  > ~/.claude/skills/warren-buffett/SKILL.md
```

**Available skills:**

Masters: `jesse-livermore`, `george-soros`, `warren-buffett`, `benjamin-graham`, `jim-simons`, `sun-tzu`, `satoshi-nakamoto`, `john-von-neumann`

Risk tools: `pre-trade-gate`, `tilt-detector`

**URL patterns:**

```
# Masters
https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main/skills/masters/{name}/SKILL.md

# Risk tools
https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main/skills/{name}/SKILL.md
```

## Method 3: Git clone

```bash
git clone https://github.com/VictorVVedtion/trading-skills.git
cp -r trading-skills/skills/masters/* ~/.claude/skills/
cp -r trading-skills/skills/pre-trade-gate ~/.claude/skills/
cp -r trading-skills/skills/tilt-detector ~/.claude/skills/
```

## Method 4: Project-specific (tracked in git)

If you want skills scoped to a single project:

```bash
cd your-project
mkdir -p .claude/skills
cp -r /path/to/trading-skills/skills/masters/* .claude/skills/
cp -r /path/to/trading-skills/skills/pre-trade-gate .claude/skills/
cp -r /path/to/trading-skills/skills/tilt-detector .claude/skills/
```

## Verify Installation

```bash
ls ~/.claude/skills/
# Should show: warren-buffett/  jim-simons/  pre-trade-gate/  etc.
```

## Uninstall

```bash
# Remove individual skill
rm -rf ~/.claude/skills/warren-buffett

# Remove all trading skills
for s in jesse-livermore george-soros warren-buffett benjamin-graham jim-simons sun-tzu satoshi-nakamoto john-von-neumann pre-trade-gate tilt-detector; do
  rm -rf ~/.claude/skills/$s
done
```

## Compatibility

- Claude Code CLI
- Claude Code Desktop App
- Claude Code VS Code Extension
- Claude Code JetBrains Extension

Skills are plain markdown files — they work with any Claude Code surface.
