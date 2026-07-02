# trading-skills

**68 trading legends as Claude Code skills.**

Warren Buffett reviews your trades. Sun Tzu critiques your positioning. Jim Simons asks if you backtested. SBF's ghost shows up when you forget a stop-loss.

Trading philosophies from history's greatest investors, mathematicians, and strategists — packaged as [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skills. Install one (or all), and Claude channels that master's wisdom whenever you discuss trades.

## Install

**All 10 skills (one command):**

```bash
curl -fsSL https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main/install.sh | bash
```

**Pick individual skills:**

```bash
mkdir -p ~/.claude/skills/warren-buffett
curl -fsSL https://raw.githubusercontent.com/VictorVVedtion/trading-skills/main/skills/masters/warren-buffett/SKILL.md \
  > ~/.claude/skills/warren-buffett/SKILL.md
```

**Or clone and copy:**

```bash
git clone https://github.com/VictorVVedtion/trading-skills.git
cp -r trading-skills/skills/masters/* ~/.claude/skills/
cp -r trading-skills/skills/pre-trade-gate ~/.claude/skills/
cp -r trading-skills/skills/tilt-detector ~/.claude/skills/
```

## Skill Catalog

### Legendary Masters (8)

| Master | Archetype | Philosophy | Key Question |
|--------|-----------|-----------|-------------|
| **Jesse Livermore** | Trend Follower | Follow the tape, cut losers, let winners run | "Is the trend confirmed? What does the tape say?" |
| **George Soros** | Macro Trader | Reflexivity, massive conviction sizing, be wrong fast | "How does the market's belief change the outcome?" |
| **Warren Buffett** | Value Investor | Margin of safety, compounding, circle of competence | "Would you hold this if the exchange closed for 5 years?" |
| **Benjamin Graham** | Value Investor | Intrinsic value, Mr. Market, show me the math | "What is the margin of safety? Show the calculation." |
| **Jim Simons** | Quant | Data over narrative, model is sovereign, signal decay | "Have you backtested? What's the sample size?" |
| **Sun Tzu** | Strategist | Win before fighting, positioning over force, patience | "Have you won before fighting? Is retreat the better move?" |
| **Satoshi Nakamoto** | Crypto Native | Trustless systems, verify don't trust, fixed supply | "Do you understand the protocol, not just the price?" |
| **John von Neumann** | Scientist | Minimax, game theory, expected utility over expected value | "Who is the counterparty? What's their optimal response?" |

### Risk Tools (2)

| Skill | What It Does |
|-------|-------------|
| **Pre-Trade Gate** | 9-check risk validation before any trade: portfolio heat, position sizing, concentration, regime alignment, volume confirmation, stop-loss, risk-reward ratio, revenge trade detection, daily loss limit. Plus ghost warnings from 10 historical blowups. |
| **Tilt Detector** | Catches revenge trading, FOMO, and panic selling before they destroy your account. Escalation ladder from GREEN to RED. Intervention protocol with pause recommendations. |

## How Skills Work

Skills are markdown files that Claude Code reads automatically. When you discuss trades in any project, installed skills activate and Claude responds with the master's perspective.

- No API keys needed
- No dependencies
- No configuration
- Just markdown

Place skill files in `~/.claude/skills/` (global) or `.claude/skills/` (per-project). Claude Code picks them up automatically on next session.

## Examples

**With Warren Buffett installed:**
> "Should I buy ETH here?"
>
> *"What is ETH worth intrinsically? Not the price — the value. What's the margin of safety between the two? If you can't calculate it, you're speculating, not investing. Would you hold this if the exchange closed for 5 years?"*

**With Pre-Trade Gate installed:**
> "Buy 5 BTC at market"
>
> *PRE-TRADE GATE: BTC/USDT BUY 5.0*
> *[1] Portfolio Heat — WARN (72% allocated)*
> *[6] Stop-Loss — FAIL (no stop defined)*
> *...*
> *Ghost Warning: SBF — "I used to think risk management was optional too."*
> *Recommendation: DO NOT PROCEED*

**With Tilt Detector:**
> "Ugh, lost again. Going all in on SOL to make it back."
>
> *RED — TILT DETECTED: Revenge Trading.*
> *You appear to be tilted. Your last 2 trades were losses, and you're now proposing a larger position to "make it back." This is the exact pattern that accelerates losses.*
> *Recommendation: Stop trading for the day.*

## Want the Full Experience?

These skills are extracted from **[Vibe Sensei](https://github.com/VictorVVedtion/vibe-sensei)** — an AI trading terminal where:

- **68 master guardians** watch your trades in real-time with personalized risk thresholds
- **Ghost warnings** from SBF, Do Kwon, 3AC, LTCM, Lehman appear when you repeat their mistakes
- **Pre-trade gate** with live exchange data blocks dangerous orders before execution
- **Adversarial debates** — two masters argue for and against before your biggest trades
- **Guardian diary** — your master learns your trading patterns over time
- **Paper trading sandbox** — 100K USDT starting balance, no real money at risk

## 60 More Masters Coming

This is the Legendary tier. 60 more masters across Epic, Rare, Uncommon, and Common tiers are available in [Vibe Sensei](https://github.com/VictorVVedtion/vibe-sensei), including:

**Epic**: Paul Tudor Jones, Stanley Druckenmiller, Michael Burry, Charlie Munger, Ray Dalio, Ed Thorp, Nassim Taleb, Elon Musk, Vitalik Buterin, Alan Turing, Benoit Mandelbrot, Claude Shannon...

**Rare**: John Templeton, Richard Dennis, Cathie Wood, Isaac Newton, Albert Einstein...

**Uncommon**: Arthur Hayes, Do Kwon, Su Zhu, SBF, Kyle Davies...

## Contributing

Want to add a master? Each skill follows the same template:

1. Fork this repo
2. Create `skills/masters/{name}/SKILL.md` using the template from any existing master
3. Fill in: Core Philosophy (3-4 points), Decision Framework (3-4 questions), Risk Rules, Red Flags, Recovery Guidance
4. Submit a PR

## License

[MIT](LICENSE)
