# Brain Ecosystem

[![CI](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml/badge.svg)](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

[English Version](README.md)

**Ein autonomes KI-Forschungssystem, das sich selbst beobachtet, lernt, weiterentwickelt und seinen eigenen Code modifiziert — gebaut als MCP-Server für Claude Code.**

![Command Center](docs/assets/command-center.png)

Brain Ecosystem ist ein System aus drei spezialisierten "Brains", verbunden durch ein Hebbsches Synapsen-Netzwerk. 76+ autonome Engines laufen in Feedback-Loops — beobachten, erkennen Anomalien, bilden Hypothesen, testen sie statistisch, destillieren Prinzipien, träumen, debattieren, denken in Ketten, fühlen Emotionen, entwickeln Strategien genetisch weiter und modifizieren ihren eigenen Quellcode. Multi-Provider LLM-Support (Anthropic + Ollama) mit Vision (Bildanalyse). Live-Marktdaten via CCXT WebSocket. Social Feeds via Bluesky + Reddit. Web-Recherche via Brave Search + Playwright + Firecrawl. Borg Collective Sync. Kausale Inferenz mit Interventionsplanung. Mehrstufige Forschungs-Roadmaps mit Ziel-Abhängigkeiten. Kreative Cross-Domain-Ideengenerierung. Selbstschutz-Guardrails mit Circuit Breaker. Engine Governance mit formalen Engine-Profilen, Runtime-Influence-Tracking, 4 Anti-Pattern-Detektoren (Retrigger-Spiralen, Stagnation, KPI-Gaming, Epistemischer Drift) und aktiver Kontrolle (Throttle/Cooldown/Isolate/Escalate/Restore). 637 MCP Tools. 4.096 Tests. Das Brain denkt buchstäblich über sich selbst nach, wird neugierig, führt Experimente durch und schreibt Code um sich zu verbessern.

## Pakete

| Paket | Version | Beschreibung | Ports |
|-------|---------|-------------|-------|
| [@timmeck/brain](packages/brain) | [![npm](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain) | Fehler-Gedächtnis, Code-Intelligenz, autonome Forschung & Selbst-Modifikation | 7777 / 7778 / 7790 |
| [@timmeck/trading-brain](packages/trading-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain) | Adaptive Trading-Intelligenz mit Signal-Lernen, Paper Trading & Live-Marktdaten | 7779 / 7780 |
| [@timmeck/marketing-brain](packages/marketing-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain) | Content-Strategie, Social Engagement & Cross-Platform-Optimierung | 7781 / 7782 / 7783 |
| [@timmeck/brain-core](packages/brain-core) | [![npm](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core) | Geteilte Infrastruktur — 76+ Engines, Synapsen, IPC, MCP, LLM, Bewusstsein, Missionen, Benachrichtigungen | — |

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
- **Workflow Checkpointing** — Workflow-Zustand speichern/laden/fortsetzen/forken mit Crash-Recovery (LangGraph-inspiriert)
- **Strukturierte LLM-Ausgabe** — ContentBlock-Typen (Text, Reasoning, ToolCall, Citation, JSON) + komponierbare Middleware-Pipeline
- **Observability & Tracing** — Hierarchische Traces mit Spans, P50/P99-Latenz, Token/Kosten-Tracking (LangSmith-inspiriert)
- **Messaging-Eingabe** — Bidirektionale Telegram- + Discord-Bots: Befehle empfangen, mit Brain-Status antworten
- **Agent Training CLI** — Benchmark-Suites, Performance-Bewertung, Szenario-Training (CrewAI-inspiriert)
- **Dynamisches Tool Scoping** — Kontextbewusstes Tool-Filtering: nur relevante Tools pro Aufgabe (LangGraph-inspiriert)
- **Plugin Marketplace** — Entdeckung, Bewertung, Installation von Community Brain-Plugins (OpenClaw-inspiriert)
- **Code Sandbox** — Docker-isolierte Code-Ausführung für sicheres Experimentieren (AutoGen-inspiriert)
- **SelfMod Pipeline** — Feature-bewusste Selbstmodifikation: absorbierter Repo-Code als Referenz für Code-Generierung
- **Vision** — LLM-Bildanalyse via Anthropic Vision + Ollama llava: Screenshots, Charts, UI-Bugs analysieren
- **Kausaler Planer** — Root-Cause-Diagnose aus Kausalgraph, Interventions-Vorschläge mit Seiteneffekt-Vorhersage
- **Forschungs-Roadmaps** — Ziel-Abhängigkeiten mit mehrstufiger Zerlegung: Daten → Hypothesen → Zielerreichung
- **Kreativ-Engine** — Cross-Domain-Ideengenerierung: Prinzip-Kreuzung, Analogie-Suche, spekulative Hypothesen
- **Guardrails** — Selbstschutz: Parameter-Bounds-Validierung, Circuit Breaker, Auto-Rollback bei sinkender Fitness, geschützte Core-Pfade

## Was es kann

### Brain — Fehler-Gedächtnis, Code-Intelligenz & volle Autonomie

171 MCP Tools. Merkt sich Fehler, lernt Lösungen, führt 58-Schritt autonome Forschungszyklen durch, träumt, debattiert, hinterfragt Prinzipien (Advocatus Diaboli), denkt, fühlt und modifiziert seinen eigenen Code.

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

## Optionale Integrationen

Brain folgt dem "Highend Optional"-Prinzip — alles optional, Kern funktioniert immer. API-Keys in die `.env` Datei (z.B. `~/.brain/.env`) eintragen um Features zu aktivieren:

### Telegram Bot

Befehle per Telegram empfangen und beantworten (Status, Suche, Missionen etc.).

1. Telegram öffnen, nach **@BotFather** suchen
2. `/newbot` senden, Anweisungen folgen, Namen wählen
3. Bot-Token kopieren (sieht aus wie `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. In `.env` eintragen:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=deine-chat-id          # optional: auf einen Chat beschränken
   ```
5. Chat-ID finden: dem Bot eine Nachricht schicken, dann `https://api.telegram.org/bot<DEIN_TOKEN>/getUpdates` aufrufen
6. Brain neustarten: `brain stop && brain start`
7. `/help` an den Bot senden — er sollte mit verfügbaren Befehlen antworten

### Discord Bot

Befehle per Discord empfangen und beantworten (Bot erwähnen oder Befehle nutzen).

1. Zum [Discord Developer Portal](https://discord.com/developers/applications) gehen
2. **New Application** klicken, Namen vergeben
3. **Bot** Tab öffnen, **Reset Token** klicken, Token kopieren
4. Unter **Privileged Gateway Intents**: **Message Content Intent** aktivieren
5. **OAuth2 > URL Generator** öffnen, Scopes `bot` + `applications.commands` wählen
6. Unter **Bot Permissions** wählen: Send Messages, Read Message History, View Channels
7. Generierte URL kopieren, im Browser öffnen, Bot auf deinen Server einladen
8. In `.env` eintragen:
   ```env
   DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.AbCdEf.xxxxx
   DISCORD_CHANNEL_ID=123456789012345678   # optional: auf einen Channel beschränken
   ```
9. Brain neustarten: `brain stop && brain start`
10. Bot in Discord erwähnen — er sollte antworten

### Anthropic API (LLM Features)

Benötigt für autonome Forschung, Selbst-Modifikation, Code-Generierung und Missionen.

1. Auf [console.anthropic.com](https://console.anthropic.com) registrieren
2. API-Key unter **API Keys** erstellen
3. In `.env` eintragen:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
   ```

### Brave Search (Web-Recherche)

Aktiviert Web-Recherche für Missionen, TechRadar und autonome Entdeckungen.

1. Auf [brave.com/search/api](https://brave.com/search/api/) registrieren
2. Kostenlosen API-Key holen (2.000 Anfragen/Monat im Free-Tier)
3. In `.env` eintragen:
   ```env
   BRAVE_SEARCH_API_KEY=BSAxxxxx
   ```

### GitHub Token (Code Intelligence)

Aktiviert CodeMiner Repo-Scanning, Signal Scanner Trending Repos und TechRadar.

1. Auf [github.com/settings/tokens](https://github.com/settings/tokens) gehen
2. **Classic** Token generieren mit `public_repo` Scope
3. In `.env` eintragen:
   ```env
   GITHUB_TOKEN=ghp_xxxxx
   ```

### Ollama (Lokale AI)

AI-Modelle lokal betreiben ohne API-Kosten. Als Fallback oder für datenschutzsensible Aufgaben.

1. Von [ollama.com](https://ollama.com) installieren
2. Modell laden: `ollama pull llama3.2`
3. Ollama läuft auf `http://localhost:11434` — Brain erkennt es automatisch

### Benachrichtigungen (Discord/Telegram/Email)

Brain kann Alerts für Cross-Brain Events, SelfMod-Vorschläge, Anomalien etc. senden.

```env
# Discord Webhook (anders als der Bot oben — für ausgehende Benachrichtigungen)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx

# Telegram (nutzt denselben Bot-Token)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=deine-chat-id

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=du@gmail.com
EMAIL_PASS=dein-app-passwort
EMAIL_FROM=du@gmail.com
EMAIL_TO=alerts@deinedomain.de
```

### Vollständiges `.env` Beispiel

```env
# Benötigt für LLM Features
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Web-Recherche
BRAVE_SEARCH_API_KEY=BSAxxxxx

# GitHub Intelligence
GITHUB_TOKEN=ghp_xxxxx

# Telegram Bot (bidirektional)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# Discord Bot (bidirektional)
DISCORD_BOT_TOKEN=MTIzNDU2.xxxxx
DISCORD_CHANNEL_ID=123456789012345678

# Discord Benachrichtigungen (ausgehender Webhook)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
```

> Alle Keys sind optional. Brain funktioniert ohne alle — man bekommt nur mehr Features je mehr man hinzufügt.

## Entwicklung

```bash
git clone https://github.com/timmeck/brain-ecosystem.git
cd brain-ecosystem
npm install          # installiert alle Workspace-Abhängigkeiten
npm run build        # baut alle Pakete (brain-core zuerst)
npm test             # führt alle 4.096 Tests aus
```

## Support

Wenn Brain dir hilft, gib ihm gerne einen Stern.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/tmeck86)

## Lizenz

[MIT](LICENSE)
