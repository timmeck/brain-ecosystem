# Brain Ecosystem

[![CI](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml/badge.svg)](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

[English Version](README.md)

**Ein autonomes KI-Forschungssystem, das sich selbst beobachtet, lernt, weiterentwickelt und seinen eigenen Code modifiziert — gebaut als MCP-Server für Claude Code.**

![Command Center](docs/assets/command-center.png)

Brain Ecosystem ist ein System aus drei spezialisierten "Brains", verbunden durch ein Hebbsches Synapsen-Netzwerk. 72+ autonome Engines laufen in Feedback-Loops — beobachten, erkennen Anomalien, bilden Hypothesen, testen sie statistisch, destillieren Prinzipien, träumen, debattieren, denken in Ketten, fühlen Emotionen, entwickeln Strategien genetisch weiter und modifizieren ihren eigenen Quellcode. Multi-Provider LLM-Support (Anthropic + Ollama). Live-Marktdaten via CCXT WebSocket. Social Feeds via Bluesky + Reddit. Web-Recherche via Brave Search + Playwright + Firecrawl. Borg Collective Sync. Plugin SDK für Community Brains. Advocatus Diaboli Prinzip-Challenges. RAG-Vektorsuche über alles Wissen. Knowledge Graph mit transitiver Inferenz. Semantische Kompression. RLHF Feedback-Lernen. Proaktive Vorschläge. Inter-Brain Teaching. Multi-Brain Konsens-Abstimmung. Aktives Lernen mit Wissenslücken-Erkennung. Automatische Widerspruchs-Auflösung im Knowledge Graph. Selbsterkenntnis eigener Fähigkeiten. 424+ MCP Tools. 3.108 Tests. Das Brain denkt buchstäblich über sich selbst nach, wird neugierig, führt Experimente durch und schreibt Code um sich zu verbessern.

## Pakete

| Paket | Version | Beschreibung | Ports |
|-------|---------|-------------|-------|
| [@timmeck/brain](packages/brain) | [![npm](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain) | Fehler-Gedächtnis, Code-Intelligenz, autonome Forschung & Selbst-Modifikation | 7777 / 7778 / 7790 |
| [@timmeck/trading-brain](packages/trading-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain) | Adaptive Trading-Intelligenz mit Signal-Lernen, Paper Trading & Live-Marktdaten | 7779 / 7780 |
| [@timmeck/marketing-brain](packages/marketing-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain) | Content-Strategie, Social Engagement & Cross-Platform-Optimierung | 7781 / 7782 / 7783 |
| [@timmeck/brain-core](packages/brain-core) | [![npm](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core) | Geteilte Infrastruktur — 72+ Engines, Synapsen, IPC, MCP, LLM, Bewusstsein, Missionen, Benachrichtigungen | — |

## Schnellstart

```bash
npm install -g @timmeck/brain
brain setup
```

Das war's. Ein Befehl konfiguriert MCP, Hooks und startet den Daemon. Brain lernt jetzt aus jedem Fehler, den du triffst.

### Optional: Weitere Brains hinzufügen

```bash
npm install -g @timmeck/trading-brain
trading setup

npm install -g @timmeck/marketing-brain
marketing setup
```

### Setup mit Cursor / Windsurf / Cline / Continue

Alle Brains unterstützen MCP über HTTP mit SSE-Transport:

```json
{
  "brain": { "url": "http://localhost:7778/sse" },
  "trading-brain": { "url": "http://localhost:7780/sse" },
  "marketing-brain": { "url": "http://localhost:7782/sse" }
}
```

## Warum Brain?

Die meisten KI-Tools vergessen alles zwischen den Sessions. Brain nicht. Es baut einen persistenten Wissensgraphen aus jedem Fehler, jedem Trade, jedem Content-Experiment auf — und nutzt dieses Wissen um besser zu werden. Es führt autonome Forschungsmissionen durch, hinterfragt seine eigenen Annahmen (Advocatus Diaboli) und modifiziert sogar seinen eigenen Quellcode wenn es Verbesserungen findet. Wenn du eine KI willst, die tatsächlich aus deiner Arbeit lernt statt jedes Mal bei Null anzufangen, ist Brain für dich.

### Was ist neu

- **RAG-Pipeline** — Universelle Vektorsuche über alles Wissen (Insights, Memories, Prinzipien, Fehler, Lösungen, Regeln) mit LLM-basiertem Reranking
- **Knowledge Graph** — Typisierte Subjekt-Prädikat-Objekt-Tripel mit transitiver Inferenz, Widerspruchserkennung und automatischer Faktenextraktion
- **Semantische Kompression** — Periodisches Clustering und Zusammenführung ähnlicher Insights zu Meta-Insights
- **RLHF Feedback** — Explizite Reward-Signale (positiv/negativ/Korrektur) die Synapsen-Gewichte, Insight-Prioritäten und Regel-Konfidenz anpassen
- **Tool-Use Learning** — Trackt Tool-Ergebnisse, empfiehlt Tools basierend auf Kontext, erkennt Tool-Sequenzen via Markov-Ketten
- **Proaktive Vorschläge** — Erkennt wiederkehrende Fehler, ungenutztes Wissen, veraltete Insights und Performance-Trends
- **User Modeling** — Inferiert Skill-Domänen, Arbeitsmuster und Kommunikationsstil aus Interaktionen
- **Code Health Monitor** — Periodische Codebase-Scans: Komplexitätstrends, Duplikaterkennung, Dependency-Gesundheit, Tech-Debt-Score
- **Inter-Brain Teaching** — Brains teilen ihre stärksten Prinzipien miteinander, bewertet nach Relevanz vor Akzeptanz
- **Konsens-Entscheidungen** — Multi-Brain-Abstimmung für High-Risk-Entscheidungen mit Mehrheits-/Supermehrheits-/Veto-Regeln
- **Aktives Lernen** — Intelligentes Gap-Closing: Forschungsmissionen, gezielte User-Fragen, Experimente, Lehranfragen
- **Widerspruchs-Auflösung** — Klassifiziert Knowledge-Graph-Widersprüche (Konfidenz-Gap, temporal, kontextual, Trade-Off) und löst sie automatisch mit Audit-Trail
- **Selbsterkenntnis** — FeatureRecommender erkennt Brains eigene Fähigkeiten und wünscht sich nur Features die wirklich fehlen
- **Generische Utilities** — `retryWithBackoff<T>()` mit exponentiellem Backoff + Jitter, `BatchQueue<T,R>` für effiziente Batch-Verarbeitung

## Was es kann

### Brain — Fehler-Gedächtnis, Code-Intelligenz & volle Autonomie

162 MCP Tools. Merkt sich Fehler, lernt Lösungen, führt 51-Schritt autonome Forschungszyklen durch, träumt, debattiert, hinterfragt Prinzipien (Advocatus Diaboli), denkt, fühlt und modifiziert seinen eigenen Code.

### Trading Brain — Adaptive Trading-Intelligenz

131 MCP Tools. Lernt aus jedem Trade-Ergebnis durch Hebbsche Synapsen und autonome Forschung.

### Marketing Brain — Selbstlernende Marketing-Intelligenz

131 MCP Tools. Lernt welcher Content auf welchen Plattformen funktioniert.

### Autonome Forschungsschicht

Alle drei Brains teilen sich 72+ autonome Engines via Brain Core:

- **51-Schritt Feedback-Loop** — ResearchOrchestrator läuft alle 5 Minuten
- **Selbst-Verbesserung** — HypothesisEngine generiert Theorien, AutoExperiment testet sie
- **Traumphase** — Offline-Gedächtniskonsolidierung: Replay, Pruning, Kompression
- **Wissensdestillation** — Extrahiert Prinzipien und Anti-Patterns aus Roherfahrung
- **Genetische Evolution** — EvolutionEngine züchtet optimale Strategie-Kombinationen

## Entwicklung

```bash
git clone https://github.com/timmeck/brain-ecosystem.git
cd brain-ecosystem
npm install          # installiert alle Workspace-Abhängigkeiten
npm run build        # baut alle Pakete (brain-core zuerst)
npm test             # führt alle 3.108 Tests aus
```

## Support

Wenn Brain dir hilft, gib ihm gerne einen Stern.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/tmeck86)

## Lizenz

[MIT](LICENSE)
