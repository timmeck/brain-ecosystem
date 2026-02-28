# Brain - Lernfähiges Wissens-System für Multi-Terminal Claude

## Vision

Brain ist ein intelligentes Speicher-System das als Daemon-Prozess läuft und mehrere Claude-Terminal-Sessions verbindet. Es besteht aus vier Systemen:

1. **Error Brain** - Erfasst automatisch Fehler, speichert Lösungen, lernt Muster und warnt Terminals bevor sie bekannte Fehler wiederholen.
2. **Code Brain** - Modulare Code-Bibliothek die projektübergreifend wiederverwendbaren Code trackt, ähnlichen Code erkennt und bei neuen Projekten passende Module vorschlägt.
3. **Synapsen-Netzwerk** - Verbindet ALLES miteinander: Errors, Solutions, Code-Module, Patterns, Projekte. Jede Synapse hat ein Gewicht das stärker wird je öfter die Verbindung bestätigt wird - wie echte Neuronen. Oft benutzte Pfade werden stärker, unbenutzte verblassen.
4. **Research Brain** - Meta-Learning Layer der über allen Daten und Synapsen sitzt. Analysiert das Gesamtnetzwerk, erkennt höhere Muster, schlägt Verbesserungen und neue Projekt-Ideen vor. Forscht autonom in den gesammelten Daten.

Das Synapsen-Netzwerk ist das Bindegewebe: Error Brain und Code Brain speichern Wissen, Synapsen verbinden es, und das Research Brain zieht Schlüsse daraus.

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Sessions                          │
│                                                                 │
│  Terminal 1        Terminal 2        Terminal 3        Terminal 4│
│  (Projekt A)       (Projekt B)       (Projekt C)       (Proj D) │
│      │                 │                 │                 │    │
│      │  ┌──────────┐   │  ┌──────────┐   │  ┌──────────┐   │    │
│      ├──┤MCP Server├   ├──┤MCP Server├   ├──┤MCP Server├   │    │
│      │  │ (stdio)  │   │  │ (stdio)  │   │  │ (stdio)  │   │    │
│      │  └────┬─────┘   │  └────┬─────┘   │  └────┬─────┘   │    │
│      │       │         │       │         │       │         │    │
│  ┌───┴──┐    │     ┌───┴──┐    │     ┌───┴──┐    │     ┌───┴──┐ │
│  │Hooks │    │     │Hooks │    │     │Hooks │    │     │Hooks │ │
│  │(auto)│    │     │(auto)│    │     │(auto)│    │     │(auto)│ │
│  └───┬──┘    │     └───┬──┘    │     └───┬──┘    │     └───┬──┘ │
└──────┼───────┼─────────┼───────┼─────────┼───────┼─────────┼────┘
       │       │         │       │         │       │         │
       └───────┴─────────┴───────┴─────────┴───────┴─────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Named Pipe IPC   │
                    │ \\.\pipe\brain-ipc │
                    └─────────┬─────────┘
                              │
               ┌──────────────┴──────────────┐
               │        Brain Daemon          │
               │                              │
               │  ┌────────────────────────┐  │
               │  │      BrainCore         │  │
               │  │  (Orchestrierung)      │  │
               │  └──────────┬─────────────┘  │
               │             │                │
               │  ┌──────────┴─────────────┐  │
               │  │       Services         │  │
               │  │  error, solution,      │  │
               │  │  code, prevention,     │  │
               │  │  synapse, terminal     │  │
               │  └──────────┬─────────────┘  │
               │             │                │
               │  ┌──────────┼─────────────┐  │
               │  │          │             │  │
               │  │  ┌───────┴────────┐    │  │
               │  │  │Learning Engine │    │  │
               │  │  │(15 min cycles) │    │  │
               │  │  └───────┬────────┘    │  │
               │  │          │             │  │
               │  │  ┌───────┴────────┐    │  │
               │  │  │Research Engine │    │  │
               │  │  │ (60 min cycles)│    │  │
               │  │  └───────┬────────┘    │  │
               │  │          │             │  │
               │  └──────────┼─────────────┘  │
               │             │                │
               │  ┌──────────┴─────────────┐  │
               │  │  ┌──────────────────┐  │  │
               │  │  │ Synapse Network  │  │  │
               │  │  │ (gewichteter     │  │  │
               │  │  │  Knowledge Graph)│  │  │
               │  │  └────────┬─────────┘  │  │
               │  │           │            │  │
               │  │  ┌────────┴─────────┐  │  │
               │  │  │ SQLite+WAL+FTS5  │  │  │
               │  │  │    brain.db      │  │  │
               │  │  └─────────────────┘  │  │
               │  └────────────────────────┘  │
               └──────────────────────────────┘
```

### Integrations-Strategie

**MCP Server** (pro Claude-Session, stdio): Claude kann Brain-Tools direkt aufrufen - Fehler melden, Lösungen suchen, Code-Module finden. Der MCP Server ist ein Thin Client der via Named Pipe mit dem Daemon kommuniziert.

**Claude Code Hooks** (automatisch, unsichtbar): PostToolUse-Hook auf Bash erkennt Fehler automatisch aus der Tool-Ausgabe (Exit-Code != 0, Stack-Traces, Error-Patterns) und sendet sie an den Daemon. Der User muss nichts manuell melden.

**CLAUDE.md Integration**: Jedes Projekt bekommt Instruktionen die Claude anweisen, bei Fehlern Brain zu konsultieren und bei erfolgreich gelösten Fehlern die Lösung zu melden.

## Technologie-Stack

- **TypeScript** mit Node.js v20+
- **better-sqlite3** (synchron, 2-10x schneller als async sqlite3, WAL-Modus für concurrent reads)
- **Named Pipes** (Windows `\\.\pipe\brain-ipc`) / Unix Sockets (`/tmp/brain.sock`) für IPC
- **FTS5** für Volltext-Suche in Fehlern, Lösungen und Code-Modulen
- **@modelcontextprotocol/sdk** für MCP Server
- **commander** für CLI
- **vitest** für Tests
- **winston** für File-Logging

## Projektstruktur

```
brain/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts                       # CLI Einstiegspunkt (commander)
│   ├── brain.ts                       # BrainCore - zentrale Orchestrierung
│   ├── config.ts                      # Konfiguration mit Defaults
│   │
│   ├── db/
│   │   ├── connection.ts              # SQLite Verbindung (WAL, Pragmas)
│   │   ├── migrations/
│   │   │   ├── 001_core_schema.ts     # projects, terminals, errors, solutions
│   │   │   ├── 002_learning_schema.ts # rules, error_chains, antipatterns
│   │   │   ├── 003_code_schema.ts     # code_modules, module_usages, module_similarities
│   │   │   ├── 004_synapses_schema.ts # synapses, insights
│   │   │   ├── 005_fts_indexes.ts     # FTS5 Tabellen + Sync-Trigger
│   │   │   └── index.ts              # Migration-Runner
│   │   └── repositories/
│   │       ├── error.repository.ts    # Jedes Repo compiled eigene Prepared Statements
│   │       ├── solution.repository.ts
│   │       ├── rule.repository.ts
│   │       ├── terminal.repository.ts
│   │       ├── project.repository.ts
│   │       ├── notification.repository.ts
│   │       ├── code-module.repository.ts
│   │       ├── antipattern.repository.ts
│   │       ├── synapse.repository.ts
│   │       └── insight.repository.ts
│   │
│   ├── matching/
│   │   ├── similarity.ts              # Levenshtein, Cosine, Jaccard
│   │   ├── error-matcher.ts           # Multi-Signal Error Matching Engine
│   │   ├── fingerprint.ts             # Strukturelles Error-Hashing
│   │   ├── tokenizer.ts              # Text-Tokenisierung
│   │   └── tfidf.ts                   # TF-IDF Index (inkrementell)
│   │
│   ├── parsing/
│   │   ├── types.ts                   # Parser-Interfaces
│   │   ├── error-parser.ts            # Registry-basierter Dispatcher
│   │   └── parsers/
│   │       ├── node.ts                # Node.js/TypeScript Errors
│   │       ├── python.ts              # Python Tracebacks
│   │       ├── rust.ts                # Rust Compiler Errors
│   │       ├── go.ts                  # Go Errors
│   │       ├── shell.ts               # Shell/Bash Errors (exit codes, command not found)
│   │       ├── compiler.ts            # Generische Compiler Errors (gcc, javac, etc.)
│   │       └── generic.ts             # Regex-basierter Fallback
│   │
│   ├── code/
│   │   ├── analyzer.ts                # Code-Analyse (Exports, Purity, Cohesion)
│   │   ├── fingerprint.ts             # Strukturelles Code-Hashing
│   │   ├── matcher.ts                 # Ähnlichen Code finden
│   │   ├── registry.ts                # Module registrieren/verwalten
│   │   ├── scorer.ts                  # Reusability-Scoring
│   │   └── parsers/
│   │       ├── typescript.ts          # TS/JS Export/Import Extraction
│   │       ├── python.ts              # Python def/class/import Extraction
│   │       └── generic.ts             # Regex-basierter Fallback
│   │
│   ├── learning/
│   │   ├── learning-engine.ts         # Lern-Zyklus Orchestrierung
│   │   ├── pattern-extractor.ts       # Centroid-basiertes Clustering
│   │   ├── rule-generator.ts          # Regeln aus Mustern generieren
│   │   ├── confidence-scorer.ts       # Wilson Score Intervall
│   │   └── decay.ts                   # Zeitbasierte Relevanz
│   │
│   ├── synapses/
│   │   ├── synapse-manager.ts         # Synapsen erstellen, stärken, schwächen
│   │   ├── hebbian.ts                 # Hebbsches Lernen (fire together → wire together)
│   │   ├── pathfinder.ts              # Multi-Hop-Pfade durch das Netzwerk finden
│   │   ├── activation.ts              # Spreading Activation Algorithmus
│   │   └── decay.ts                   # Synaptische Abschwächung bei Nicht-Nutzung
│   │
│   ├── research/
│   │   ├── research-engine.ts         # Forschungs-Zyklus Orchestrierung
│   │   ├── trend-analyzer.ts          # Trends erkennen (was wird besser/schlechter)
│   │   ├── gap-analyzer.ts            # Lücken finden (wiederkehrende ungelöste Probleme)
│   │   ├── synergy-detector.ts        # Synergien zwischen Projekten erkennen
│   │   ├── template-extractor.ts      # Wiederholte Patterns zu Templates generalisieren
│   │   └── insight-generator.ts       # Insights generieren und priorisieren
│   │
│   ├── ipc/
│   │   ├── server.ts                  # Named Pipe IPC Server
│   │   ├── client.ts                  # Client für MCP Server → Daemon
│   │   ├── protocol.ts               # Length-prefixed JSON Framing
│   │   └── router.ts                  # Methoden-Routing
│   │
│   ├── mcp/
│   │   ├── server.ts                  # MCP Server Entry (stdio Transport)
│   │   ├── tools.ts                   # Tool-Definitionen für Claude
│   │   └── auto-detect.ts             # Error-Pattern-Erkennung aus Output
│   │
│   ├── services/
│   │   ├── error.service.ts
│   │   ├── solution.service.ts
│   │   ├── terminal.service.ts
│   │   ├── prevention.service.ts
│   │   ├── code.service.ts
│   │   ├── synapse.service.ts
│   │   ├── research.service.ts
│   │   ├── notification.service.ts
│   │   └── analytics.service.ts
│   │
│   ├── cli/
│   │   └── commands/
│   │       ├── start.ts               # brain start - Daemon starten
│   │       ├── stop.ts                # brain stop - Daemon stoppen
│   │       ├── status.ts              # brain status - Textbasierter Status
│   │       ├── query.ts               # brain query "error" - Fehler suchen
│   │       ├── modules.ts             # brain modules - Code-Module auflisten
│   │       └── export.ts              # brain export - Daten exportieren
│   │
│   ├── hooks/
│   │   ├── post-tool-use.ts           # Hook-Script für automatische Error-Erkennung
│   │   └── post-write.ts             # Hook-Script für automatische Code-Analyse
│   │
│   ├── types/
│   │   ├── error.types.ts
│   │   ├── solution.types.ts
│   │   ├── code.types.ts
│   │   ├── ipc.types.ts
│   │   ├── mcp.types.ts
│   │   └── config.types.ts
│   │
│   └── utils/
│       ├── logger.ts                  # Winston File-Logger
│       ├── hash.ts                    # SHA-256 Hashing
│       ├── paths.ts                   # Pfad-Normalisierung
│       └── events.ts                  # Typisierter EventBus
│
├── tests/
│   ├── unit/
│   │   ├── matching/
│   │   ├── parsing/
│   │   ├── code/
│   │   └── learning/
│   ├── integration/
│   │   ├── error-flow.test.ts         # Error → Match → Solution → Learn
│   │   ├── code-flow.test.ts          # Code → Analyze → Register → Match
│   │   └── ipc-flow.test.ts           # MCP → IPC → Daemon → Response
│   └── fixtures/
│       ├── errors/                    # Beispiel-Errors pro Sprache
│       ├── solutions/
│       └── code-modules/              # Beispiel-Code für Matching-Tests
│
└── data/                              # Runtime (gitignored)
    ├── brain.db
    └── brain.log
```

## Datenbank-Schema

### projects
```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  root_path TEXT NOT NULL,
  languages TEXT,                       -- JSON Array: ["typescript", "python"]
  frameworks TEXT,                      -- JSON Array: ["express", "react"]
  description TEXT,                     -- Kurzbeschreibung des Projekts
  error_count INTEGER NOT NULL DEFAULT 0,
  solution_count INTEGER NOT NULL DEFAULT 0,
  module_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### terminals
```sql
CREATE TABLE terminals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  pid INTEGER,
  project_id INTEGER REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK(status IN ('connected', 'disconnected', 'stale')),
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT                         -- JSON: Shell, OS, etc.
);
CREATE INDEX idx_terminals_status ON terminals(status);
```

### errors
```sql
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  error_type TEXT NOT NULL,              -- "TypeError", "ENOENT", "SyntaxError", etc.
  message TEXT NOT NULL,
  message_template TEXT,                 -- Templatisierte Version
  stack_trace TEXT,
  source_file TEXT,
  source_line INTEGER,

  -- Was wir wirklich haben (statt generischem "context" JSON)
  raw_output TEXT,                       -- Tatsächlicher Terminal-Output
  command TEXT,                          -- Befehl der den Error auslöste
  working_directory TEXT,
  task_context TEXT,                     -- Was der User versuchte zu tun

  -- Auto-Labels statt separater Tag-Tabellen
  labels TEXT,                           -- JSON Array: ["typescript", "import", "node_modules"]

  project_id INTEGER REFERENCES projects(id),
  terminal_id INTEGER REFERENCES terminals(id),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_errors_fingerprint ON errors(fingerprint);
CREATE INDEX idx_errors_type ON errors(error_type);
CREATE INDEX idx_errors_project ON errors(project_id);
CREATE INDEX idx_errors_resolved ON errors(resolved);
```

### stack_frames
```sql
CREATE TABLE stack_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_id INTEGER NOT NULL REFERENCES errors(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  function_name TEXT,
  file_path TEXT,
  line_number INTEGER,
  column_number INTEGER,
  normalized TEXT                        -- Pfad/Zeile normalisiert für Matching
);
CREATE INDEX idx_stack_frames_error ON stack_frames(error_id);
```

### solutions
```sql
CREATE TABLE solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  labels TEXT,                           -- JSON Array: ["config", "tsconfig", "path-mapping"]
  steps TEXT,                            -- JSON Array von Schritten
  code_before TEXT,
  code_after TEXT,
  diff TEXT,
  confidence_score REAL NOT NULL DEFAULT 0.0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  project_id INTEGER REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### error_solutions
```sql
CREATE TABLE error_solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_id INTEGER NOT NULL REFERENCES errors(id) ON DELETE CASCADE,
  solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  outcome TEXT CHECK(outcome IN ('success', 'failure', 'partial', 'pending')),
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_by_terminal INTEGER REFERENCES terminals(id),
  notes TEXT,
  UNIQUE(error_id, solution_id, applied_at)
);
```

### solution_attempts (was NICHT funktioniert hat)
```sql
CREATE TABLE solution_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_id INTEGER NOT NULL REFERENCES errors(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('failure', 'partial')),
  reason TEXT,                           -- Warum hat es nicht funktioniert
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  terminal_id INTEGER REFERENCES terminals(id)
);
```

### error_chains (Fehler A verursacht Fehler B)
```sql
CREATE TABLE error_chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,              -- Gruppiert Fehler einer Session
  error_id INTEGER NOT NULL REFERENCES errors(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,             -- Reihenfolge in der Chain
  time_delta_ms INTEGER,                 -- Zeit seit vorigem Fehler in der Chain
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_error_chains_session ON error_chains(session_id);
CREATE INDEX idx_error_chains_error ON error_chains(error_id);
```

### synapses (das neuronale Netzwerk)
Verbindet ALLES miteinander. Jede Synapse hat ein Gewicht das durch Hebbsches Lernen stärker oder schwächer wird.

```sql
CREATE TABLE synapses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source-Knoten
  source_type TEXT NOT NULL CHECK(source_type IN (
    'error', 'solution', 'code_module', 'rule', 'antipattern', 'project', 'insight'
  )),
  source_id INTEGER NOT NULL,

  -- Target-Knoten
  target_type TEXT NOT NULL CHECK(target_type IN (
    'error', 'solution', 'code_module', 'rule', 'antipattern', 'project', 'insight'
  )),
  target_id INTEGER NOT NULL,

  -- Verbindungs-Typ
  synapse_type TEXT NOT NULL CHECK(synapse_type IN (
    'solves',             -- Solution löst Error
    'causes',             -- Error verursacht Error
    'similar_to',         -- Ähnlichkeit (Error↔Error, Code↔Code)
    'uses_module',        -- Solution/Project nutzt Code-Module
    'derived_from',       -- Abgeleitet von (Rule aus Error, Insight aus Pattern)
    'co_occurs',          -- Tritt gemeinsam auf (zeitliche Korrelation)
    'prevents',           -- Rule/Antipattern verhindert Error
    'improves',           -- Insight verbessert Projekt/Code
    'generalizes',        -- Pattern ist Generalisierung von Einzelfällen
    'cross_project'       -- Verbindung zwischen Projekten (gleicher Fehler, gleicher Code)
  )),

  -- Synaptisches Gewicht (Hebbsches Lernen)
  weight REAL NOT NULL DEFAULT 0.1,            -- Startet schwach, wird stärker
  activation_count INTEGER NOT NULL DEFAULT 1, -- Wie oft wurde dieser Pfad benutzt
  last_activated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Kontext
  context TEXT,                                -- JSON: Warum diese Verbindung existiert
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(source_type, source_id, target_type, target_id, synapse_type)
);

CREATE INDEX idx_synapses_source ON synapses(source_type, source_id);
CREATE INDEX idx_synapses_target ON synapses(target_type, target_id);
CREATE INDEX idx_synapses_type ON synapses(synapse_type);
CREATE INDEX idx_synapses_weight ON synapses(weight DESC);
```

### insights (Erkenntnisse des Research Brain)
```sql
CREATE TABLE insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Klassifikation
  insight_type TEXT NOT NULL CHECK(insight_type IN (
    'trend',              -- "Error-Rate in Projekt A sinkt seit 2 Wochen"
    'pattern',            -- "Du baust in jedem Projekt einen API-Client"
    'gap',                -- "Kein Projekt hat ordentliches Error-Handling für X"
    'synergy',            -- "Module A + Module B = vollständiges Auth-System"
    'optimization',       -- "retry.ts aus Projekt A ist 30% effizienter als Projekt B's Version"
    'template_candidate', -- "Dieser Code-Pattern wiederholt sich - Template erstellen?"
    'project_suggestion', -- "Basierend auf deinen Modulen könntest du X bauen"
    'warning'             -- "Dependency X verursacht Fehler in 3 von 4 Projekten"
  )),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence TEXT NOT NULL,                      -- JSON: Welche Daten stützen diesen Insight
  confidence REAL NOT NULL DEFAULT 0.5,

  -- Aktionierbarkeit
  actionable INTEGER NOT NULL DEFAULT 0,       -- Hat dieser Insight eine konkrete Aktion?
  suggested_action TEXT,                       -- JSON: Was sollte man tun
  action_taken INTEGER NOT NULL DEFAULT 0,     -- Wurde darauf reagiert?
  action_outcome TEXT,                         -- Ergebnis der Aktion

  -- Relevanz
  affected_project_ids TEXT,                   -- JSON Array
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('low', 'medium', 'high', 'critical')),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'acknowledged', 'acted_upon', 'dismissed', 'expired')),
  expires_at TEXT,                             -- Manche Insights sind zeitgebunden

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_insights_type ON insights(insight_type);
CREATE INDEX idx_insights_status ON insights(status);
CREATE INDEX idx_insights_priority ON insights(priority);
```

### rules
```sql
CREATE TABLE rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  pattern TEXT NOT NULL,                 -- JSON: Matching-Kriterien
  action TEXT NOT NULL,                  -- JSON: Was tun wenn Pattern matcht
  rule_type TEXT NOT NULL CHECK(rule_type IN ('prevention', 'suggestion', 'warning', 'auto_fix')),
  confidence REAL NOT NULL DEFAULT 0.0,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  source_error_ids TEXT,                 -- JSON Array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### antipatterns (explizites "Tu das NICHT")
```sql
CREATE TABLE antipatterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,             -- "Nie X mit Y Config kombinieren"
  trigger_pattern TEXT NOT NULL,         -- JSON: Wann warnen
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK(severity IN ('info', 'warning', 'critical')),
  learned_from_error_ids TEXT,           -- JSON Array
  project_id INTEGER REFERENCES projects(id), -- NULL = global
  confidence REAL NOT NULL DEFAULT 0.5,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### notifications (statt Inter-Terminal-Chat)
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_terminal_id INTEGER REFERENCES terminals(id), -- NULL = alle Terminals
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'solution_available',                -- "Diesen Fehler hatten wir schon, Lösung existiert"
    'error_recurring',                   -- "Dieser Fehler tritt gerade in Projekt B auch auf"
    'rule_triggered',                    -- "Prevention-Rule hat angeschlagen"
    'learning_insight',                  -- "Neues Muster erkannt"
    'module_suggested',                  -- "Wiederverwendbarer Code verfügbar"
    'antipattern_warning'                -- "Bekanntes Anti-Pattern erkannt"
  )),
  reference_type TEXT,                   -- 'error', 'solution', 'rule', 'code_module', 'antipattern'
  reference_id INTEGER,
  summary TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_terminal ON notifications(target_terminal_id);
CREATE INDEX idx_notifications_ack ON notifications(acknowledged);
```

### code_modules
```sql
CREATE TABLE code_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identität
  name TEXT NOT NULL,                    -- "retry", "logger", "AuthMiddleware"
  module_type TEXT NOT NULL CHECK(module_type IN (
    'file',                              -- Ganze Datei als Modul
    'function',                          -- Einzelne Funktion
    'class',                             -- Klasse
    'pattern'                            -- Architektur-Pattern
  )),

  -- Herkunft
  project_id INTEGER NOT NULL REFERENCES projects(id),
  file_path TEXT NOT NULL,               -- Relativ zu project root
  start_line INTEGER,                    -- NULL bei file-level Modulen
  end_line INTEGER,

  -- Code
  source_code TEXT NOT NULL,
  fingerprint TEXT NOT NULL,             -- Struktureller Hash
  language TEXT NOT NULL,

  -- Klassifikation
  category TEXT,                         -- "utility", "middleware", "config", "hook", "component", "service"
  purpose TEXT NOT NULL,                 -- "Retry wrapper with exponential backoff and jitter"
  interface_signature TEXT,              -- "retry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>"
  dependencies TEXT,                     -- JSON: Externe Packages ["axios", "lodash"]
  internal_imports TEXT,                 -- JSON: Interne Abhängigkeiten ["./logger", "./types"]
  labels TEXT,                           -- JSON: Auto-Labels ["async", "error-handling", "http"]

  -- Qualitätssignale
  reuse_count INTEGER NOT NULL DEFAULT 0,
  adaptation_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,  -- Wie wiederverwendbar ist das
  is_pure INTEGER NOT NULL DEFAULT 0,    -- Keine Side-Effects?
  complexity_score REAL,                 -- Niedrig = besser wiederverwendbar

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_modules_fingerprint ON code_modules(fingerprint);
CREATE INDEX idx_modules_language ON code_modules(language);
CREATE INDEX idx_modules_category ON code_modules(category);
CREATE INDEX idx_modules_project ON code_modules(project_id);
```

### module_usages
```sql
CREATE TABLE module_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES code_modules(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  file_path TEXT NOT NULL,               -- Wo wurde es eingesetzt
  usage_type TEXT NOT NULL CHECK(usage_type IN (
    'exact',                             -- 1:1 kopiert
    'adapted',                           -- Angepasst
    'pattern_based'                      -- Gleiches Pattern, andere Implementierung
  )),
  adaptations TEXT,                      -- JSON: Was wurde geändert
  outcome TEXT NOT NULL DEFAULT 'unknown'
    CHECK(outcome IN ('success', 'failure', 'unknown')),
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_module_usages_module ON module_usages(module_id);
CREATE INDEX idx_module_usages_project ON module_usages(project_id);
```

### module_similarities
```sql
CREATE TABLE module_similarities (
  module_id_1 INTEGER NOT NULL REFERENCES code_modules(id) ON DELETE CASCADE,
  module_id_2 INTEGER NOT NULL REFERENCES code_modules(id) ON DELETE CASCADE,
  similarity_score REAL NOT NULL,
  similarity_type TEXT NOT NULL CHECK(similarity_type IN (
    'exact',                             -- Identischer Code (anderes Projekt)
    'structural',                        -- Gleiche Struktur, andere Namen
    'semantic'                           -- Gleicher Zweck, andere Implementierung
  )),
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (module_id_1, module_id_2)
);
```

### FTS5 Volltext-Suche
```sql
-- Error-Suche
CREATE VIRTUAL TABLE errors_fts USING fts5(
  message, message_template, stack_trace, raw_output, task_context,
  content=errors, content_rowid=id
);

-- Solution-Suche
CREATE VIRTUAL TABLE solutions_fts USING fts5(
  title, description, steps, code_before, code_after,
  content=solutions, content_rowid=id
);

-- Code-Modul-Suche
CREATE VIRTUAL TABLE code_modules_fts USING fts5(
  name, purpose, source_code, interface_signature,
  content=code_modules, content_rowid=id
);

-- Sync-Trigger für errors_fts
CREATE TRIGGER errors_ai AFTER INSERT ON errors BEGIN
  INSERT INTO errors_fts(rowid, message, message_template, stack_trace, raw_output, task_context)
  VALUES (new.id, new.message, new.message_template, new.stack_trace, new.raw_output, new.task_context);
END;

CREATE TRIGGER errors_ad AFTER DELETE ON errors BEGIN
  INSERT INTO errors_fts(errors_fts, rowid, message, message_template, stack_trace, raw_output, task_context)
  VALUES ('delete', old.id, old.message, old.message_template, old.stack_trace, old.raw_output, old.task_context);
END;

CREATE TRIGGER errors_au AFTER UPDATE ON errors BEGIN
  INSERT INTO errors_fts(errors_fts, rowid, message, message_template, stack_trace, raw_output, task_context)
  VALUES ('delete', old.id, old.message, old.message_template, old.stack_trace, old.raw_output, old.task_context);
  INSERT INTO errors_fts(rowid, message, message_template, stack_trace, raw_output, task_context)
  VALUES (new.id, new.message, new.message_template, new.stack_trace, new.raw_output, new.task_context);
END;

-- Sync-Trigger für solutions_fts
CREATE TRIGGER solutions_ai AFTER INSERT ON solutions BEGIN
  INSERT INTO solutions_fts(rowid, title, description, steps, code_before, code_after)
  VALUES (new.id, new.title, new.description, new.steps, new.code_before, new.code_after);
END;

CREATE TRIGGER solutions_ad AFTER DELETE ON solutions BEGIN
  INSERT INTO solutions_fts(solutions_fts, rowid, title, description, steps, code_before, code_after)
  VALUES ('delete', old.id, old.title, old.description, old.steps, old.code_before, old.code_after);
END;

CREATE TRIGGER solutions_au AFTER UPDATE ON solutions BEGIN
  INSERT INTO solutions_fts(solutions_fts, rowid, title, description, steps, code_before, code_after)
  VALUES ('delete', old.id, old.title, old.description, old.steps, old.code_before, old.code_after);
  INSERT INTO solutions_fts(rowid, title, description, steps, code_before, code_after)
  VALUES (new.id, new.title, new.description, new.steps, new.code_before, new.code_after);
END;

-- Sync-Trigger für code_modules_fts
CREATE TRIGGER code_modules_ai AFTER INSERT ON code_modules BEGIN
  INSERT INTO code_modules_fts(rowid, name, purpose, source_code, interface_signature)
  VALUES (new.id, new.name, new.purpose, new.source_code, new.interface_signature);
END;

CREATE TRIGGER code_modules_ad AFTER DELETE ON code_modules BEGIN
  INSERT INTO code_modules_fts(code_modules_fts, rowid, name, purpose, source_code, interface_signature)
  VALUES ('delete', old.id, old.name, old.purpose, old.source_code, old.interface_signature);
END;

CREATE TRIGGER code_modules_au AFTER UPDATE ON code_modules BEGIN
  INSERT INTO code_modules_fts(code_modules_fts, rowid, name, purpose, source_code, interface_signature)
  VALUES ('delete', old.id, old.name, old.purpose, old.source_code, old.interface_signature);
  INSERT INTO code_modules_fts(rowid, name, purpose, source_code, interface_signature)
  VALUES (new.id, new.name, new.purpose, new.source_code, new.interface_signature);
END;
```

## Kern-Algorithmen

### Error-Fingerprinting

Struktureller Hash: error_type + templatisierte Message + Top-3 Stack-Frames → SHA-256.

**Templatisierung:** Variable Teile werden durch Platzhalter ersetzt:
- Dateipfade → `<PATH>`
- Zeilennummern → `<LINE>`
- Variablennamen in Fehlermessages → bleiben (oft key info)
- Zahlen in generischen Kontexten → `<NUM>`
- Hex-Adressen → `<ADDR>`
- UUIDs → `<UUID>`
- URLs → `<URL>`
- Timestamps → `<TIMESTAMP>`

```typescript
function templateMessage(msg: string): string {
  return msg
    .replace(/[A-Z]:\\[\w\-\.\\]+\.\w+/g, '<PATH>')     // Windows-Pfade
    .replace(/\/[\w\-\.\/]+\.\w+/g, '<PATH>')             // Unix-Pfade
    .replace(/:\d+:\d+/g, ':<LINE>:<COL>')                // Zeile:Spalte
    .replace(/line \d+/gi, 'line <LINE>')                  // "line 42"
    .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')                 // Hex
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/https?:\/\/[^\s]+/g, '<URL>')                // URLs
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>');
}

function generateFingerprint(errorType: string, message: string, frames: StackFrame[]): string {
  const template = templateMessage(message);
  const topFrames = frames.slice(0, 3).map(f =>
    `${f.function_name || '<anon>'}@${basename(f.file_path || '<unknown>')}`
  ).join('|');
  const input = `${errorType}::${template}::${topFrames}`;
  return createHash('sha256').update(input).digest('hex');
}
```

### Multi-Signal Error-Matching

```typescript
interface MatchSignal {
  name: string;
  weight: number;
  compute: (a: ErrorRecord, b: ErrorRecord) => number; // 0.0 - 1.0
}

const SIGNALS: MatchSignal[] = [
  { name: 'fingerprint',        weight: 0.30, compute: fingerprintMatch },
  { name: 'message_similarity', weight: 0.20, compute: messageSimilarity },
  { name: 'type_match',         weight: 0.15, compute: typeMatch },
  { name: 'stack_similarity',   weight: 0.15, compute: stackSimilarity },
  { name: 'file_similarity',    weight: 0.10, compute: fileSimilarity },
  { name: 'fts_score',          weight: 0.10, compute: ftsScore },
];

const MATCH_THRESHOLD = 0.70;
const STRONG_MATCH_THRESHOLD = 0.90;

function matchError(incoming: ErrorRecord, candidates: ErrorRecord[]): MatchResult[] {
  return candidates
    .map(candidate => {
      const scores = SIGNALS.map(signal => {
        const score = signal.compute(incoming, candidate);
        return {
          signal: signal.name,
          score,
          weighted: score * signal.weight,
        };
      });
      const totalScore = scores.reduce((sum, s) => sum + s.weighted, 0);
      return { candidate, scores, totalScore, isMatch: totalScore >= MATCH_THRESHOLD };
    })
    .filter(r => r.isMatch)
    .sort((a, b) => b.totalScore - a.totalScore);
}
```

### Similarity-Funktionen

```typescript
// Levenshtein Distanz (normalisiert auf 0-1 Similarity)
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// Cosine Similarity auf Token-Vektoren
function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  const vocab = new Set([...tokensA, ...tokensB]);
  const vecA = new Map<string, number>();
  const vecB = new Map<string, number>();
  tokensA.forEach(t => vecA.set(t, (vecA.get(t) || 0) + 1));
  tokensB.forEach(t => vecB.set(t, (vecB.get(t) || 0) + 1));

  let dot = 0, magA = 0, magB = 0;
  for (const word of vocab) {
    const a = vecA.get(word) || 0;
    const b = vecB.get(word) || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// Jaccard Similarity auf Token-Sets
function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
```

### TF-IDF (Inkrementell)

```typescript
class TfIdfIndex {
  private documents: Map<number, string[]> = new Map();
  private df: Map<string, number> = new Map();        // Document Frequency Cache
  private idf: Map<string, number> = new Map();
  private documentCount = 0;

  addDocument(id: number, tokens: string[]): void {
    // Inkrementelles DF-Update statt Full-Recompute
    const unique = new Set(tokens);
    for (const token of unique) {
      this.df.set(token, (this.df.get(token) || 0) + 1);
    }
    this.documents.set(id, tokens);
    this.documentCount++;
    this.recomputeIdfForTerms(unique);
  }

  removeDocument(id: number): void {
    const tokens = this.documents.get(id);
    if (!tokens) return;

    const unique = new Set(tokens);
    for (const token of unique) {
      const count = (this.df.get(token) || 1) - 1;
      if (count <= 0) {
        this.df.delete(token);
        this.idf.delete(token);
      } else {
        this.df.set(token, count);
      }
    }
    this.documents.delete(id);
    this.documentCount--;
    this.recomputeIdfForTerms(unique);
  }

  private recomputeIdfForTerms(terms: Set<string>): void {
    const N = this.documentCount;
    for (const term of terms) {
      const count = this.df.get(term);
      if (count) {
        this.idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
      }
    }
  }

  search(queryTokens: string[], topK = 10): Array<{ id: number; score: number }> {
    const results: Array<{ id: number; score: number }> = [];

    for (const [id, docTokens] of this.documents) {
      let score = 0;
      const tf = new Map<string, number>();
      docTokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));

      for (const qt of queryTokens) {
        const termFreq = (tf.get(qt) || 0) / docTokens.length;
        const inverseDocFreq = this.idf.get(qt) || 0;
        score += termFreq * inverseDocFreq;
      }
      if (score > 0) results.push({ id, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  // Persistenz: Zustand in SQLite speichern/laden für schnelle Daemon-Neustarts
  serialize(): { documents: [number, string[]][]; df: [string, number][] } {
    return {
      documents: [...this.documents.entries()],
      df: [...this.df.entries()],
    };
  }

  static deserialize(data: ReturnType<TfIdfIndex['serialize']>): TfIdfIndex {
    const index = new TfIdfIndex();
    index.documents = new Map(data.documents);
    index.df = new Map(data.df);
    index.documentCount = index.documents.size;
    // IDF aus DF recomputen
    const N = index.documentCount;
    for (const [term, count] of index.df) {
      index.idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
    }
    return index;
  }
}
```

### Confidence-Scoring (Wilson Score Intervall)

```typescript
// Wilson Score Interval - Lower Bound
// Besser als Durchschnitt: berücksichtigt Stichprobengröße
function wilsonScore(successes: number, total: number, z = 1.96): number {
  if (total === 0) return 0;

  const p = successes / total;
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const adjustment = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);

  return (centre - adjustment) / denominator;
}

// Zeitbasierter Decay
function timeDecay(timestamp: Date, halfLifeDays = 30): number {
  const now = new Date();
  const ageMs = now.getTime() - timestamp.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

// Kombinierter Score
function computeConfidence(
  successes: number,
  failures: number,
  lastUsed: Date,
  halfLifeDays = 30
): number {
  const total = successes + failures;
  const wilson = wilsonScore(successes, total);
  const decay = timeDecay(lastUsed, halfLifeDays);
  return wilson * decay;
}
```

### Code-Fingerprinting (Strukturell)

```typescript
function fingerprintCode(source: string, language: string): string {
  // 1. Comments entfernen
  let normalized = stripComments(source, language);

  // 2. Whitespace normalisieren
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // 3. Identifier normalisieren (aber Import-Names und API-Calls behalten)
  normalized = normalizeIdentifiers(normalized, language);

  // 4. String-Literale normalisieren
  normalized = normalized.replace(/'[^']*'/g, "'<STR>'");
  normalized = normalized.replace(/"[^"]*"/g, '"<STR>"');
  normalized = normalized.replace(/`[^`]*`/g, '`<STR>`');

  // 5. Zahlen normalisieren
  normalized = normalized.replace(/\b\d+\b/g, '<NUM>');

  return createHash('sha256').update(normalized).digest('hex');
}

function stripComments(source: string, language: string): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'java':
    case 'go':
    case 'rust':
      return source
        .replace(/\/\/.*$/gm, '')           // Single-line
        .replace(/\/\*[\s\S]*?\*\//g, '');  // Multi-line
    case 'python':
      return source
        .replace(/#.*$/gm, '')              // Single-line
        .replace(/"""[\s\S]*?"""/g, '')     // Docstrings
        .replace(/'''[\s\S]*?'''/g, '');
    default:
      return source.replace(/\/\/.*$/gm, '').replace(/#.*$/gm, '');
  }
}

function normalizeIdentifiers(source: string, language: string): string {
  // Lokale Variablen normalisieren, aber importierte Namen behalten
  // Einfache Heuristik: camelCase/snake_case Wörter die nicht in Import-Statements stehen
  const imports = extractImportNames(source, language);
  const keywords = getLanguageKeywords(language);
  const preserve = new Set([...imports, ...keywords]);

  return source.replace(/\b[a-zA-Z_]\w*\b/g, (match) => {
    if (preserve.has(match)) return match;
    // Behalte den ersten Buchstaben als Typ-Hint (großbuchstabe = Klasse)
    if (match[0] === match[0].toUpperCase()) return '<CLASS>';
    return '<VAR>';
  });
}
```

### Code-Reusability-Scoring

```typescript
interface ReusabilitySignal {
  name: string;
  weight: number;
  check: (code: CodeUnit) => number; // 0.0 - 1.0
}

const REUSABILITY_SIGNALS: ReusabilitySignal[] = [
  {
    name: 'single_responsibility',
    weight: 0.25,
    // Datei hat EINEN klaren Zweck (1-3 Exports, kohärente Naming)
    check: (code) => {
      const exports = code.exports.length;
      if (exports === 0) return 0;
      if (exports <= 3) return 1.0;
      if (exports <= 6) return 0.6;
      return 0.3;
    }
  },
  {
    name: 'pure_function',
    weight: 0.20,
    // Keine Side-Effects: kein fs, kein process, kein console, kein fetch
    check: (code) => {
      const sideEffects = ['fs.', 'process.', 'console.', 'fetch(', 'XMLHttpRequest',
        'document.', 'window.', 'global.', 'require('];
      const found = sideEffects.filter(se => code.source.includes(se));
      return found.length === 0 ? 1.0 : Math.max(0, 1 - found.length * 0.3);
    }
  },
  {
    name: 'clear_interface',
    weight: 0.20,
    // Typisierte Parameter, klarer Return-Type, keine any
    check: (code) => {
      let score = 0.5; // Baseline
      if (code.hasTypeAnnotations) score += 0.3;
      if (!code.source.includes(': any')) score += 0.2;
      return Math.min(1.0, score);
    }
  },
  {
    name: 'low_coupling',
    weight: 0.15,
    // Wenig interne Imports, wenig externe Dependencies
    check: (code) => {
      const internalImports = code.internalImports.length;
      const externalImports = code.externalImports.length;
      const total = internalImports + externalImports;
      if (total === 0) return 1.0;
      if (total <= 3) return 0.8;
      if (total <= 6) return 0.5;
      return 0.2;
    }
  },
  {
    name: 'generic_utility',
    weight: 0.10,
    // Pfad enthält utils/, helpers/, lib/, shared/
    // Oder: Funktion nutzt Generics
    check: (code) => {
      const utilPaths = ['utils/', 'helpers/', 'lib/', 'shared/', 'common/'];
      const isUtilPath = utilPaths.some(p => code.filePath.includes(p));
      const hasGenerics = /\<[A-Z]\w*\>/.test(code.source);
      let score = 0;
      if (isUtilPath) score += 0.6;
      if (hasGenerics) score += 0.4;
      return Math.min(1.0, score || 0.2);
    }
  },
  {
    name: 'documentation',
    weight: 0.10,
    // JSDoc/TSDoc/Docstring vorhanden
    check: (code) => {
      const hasJsdoc = /\/\*\*[\s\S]*?\*\//.test(code.source);
      const hasDocstring = /"""[\s\S]*?"""/.test(code.source) || /'''[\s\S]*?'''/.test(code.source);
      const hasInlineComments = (code.source.match(/\/\/ /g) || []).length >= 2;
      if (hasJsdoc || hasDocstring) return 1.0;
      if (hasInlineComments) return 0.5;
      return 0.1;
    }
  },
];

const MODULE_THRESHOLD = 0.60;
```

### Smart Granularity Detection

```typescript
function detectGranularity(filePath: string, source: string, language: string): ModuleType {
  const exports = extractExports(source, language);

  // Datei mit 1 Default-Export → Ganzes File ist das Modul
  if (exports.default && exports.named.length <= 2) {
    return 'file';
  }

  // Datei mit einer Klasse → Klasse ist das Modul
  if (exports.classes.length === 1 && exports.named.length <= 3) {
    return 'class';
  }

  // Datei mit vielen unzusammenhängenden Exports → Einzeln tracken
  if (exports.named.length > 3) {
    const cohesion = measureExportCohesion(exports, source);
    if (cohesion < 0.5) {
      return 'function'; // Jeder Export wird einzeln als Modul registriert
    }
  }

  // Default: Ganze Datei
  return 'file';
}

function measureExportCohesion(exports: ExportInfo, source: string): number {
  // Messe ob die Exports thematisch zusammengehören
  // Heuristik: Teilen sie gemeinsame Tokens in ihren Namen?
  const names = exports.named.map(e => tokenizeCamelCase(e.name));
  if (names.length <= 1) return 1.0;

  let sharedTokens = 0;
  let totalPairs = 0;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const shared = names[i].filter(t => names[j].includes(t)).length;
      const total = new Set([...names[i], ...names[j]]).size;
      sharedTokens += total > 0 ? shared / total : 0;
      totalPairs++;
    }
  }
  return totalPairs > 0 ? sharedTokens / totalPairs : 0;
}
```

### Pattern-Extraktion (Centroid-basiert)

```typescript
class PatternExtractor {
  extractPatterns(pairs: ErrorSolutionPair[]): Pattern[] {
    const clusters: { pairs: ErrorSolutionPair[]; centroid: number[] }[] = [];

    for (const pair of pairs) {
      const tokens = tokenize(pair.error.message_template || pair.error.message);
      const vector = this.tokensToVector(tokens);

      let bestCluster: typeof clusters[number] | null = null;
      let bestSim = 0;

      for (const cluster of clusters) {
        const sim = this.vectorCosineSimilarity(vector, cluster.centroid);
        if (sim >= 0.75 && sim > bestSim) {
          bestSim = sim;
          bestCluster = cluster;
        }
      }

      if (bestCluster) {
        bestCluster.pairs.push(pair);
        // Centroid aktualisieren (Running Average)
        bestCluster.centroid = this.updateCentroid(bestCluster.centroid, vector, bestCluster.pairs.length);
      } else {
        clusters.push({ pairs: [pair], centroid: vector });
      }
    }

    return clusters
      .filter(c => c.pairs.length >= 2)
      .map(cluster => ({
        errorTemplate: this.findCommonTemplate(cluster.pairs),
        solutionSummary: this.findCommonSolution(cluster.pairs),
        occurrences: cluster.pairs.length,
        confidence: this.computeClusterConfidence(cluster.pairs),
        successRate: this.computeSuccessRate(cluster.pairs),
        errorIds: cluster.pairs.map(p => p.error.id),
        solutionIds: [...new Set(cluster.pairs.map(p => p.solution.id))],
      }));
  }

  private updateCentroid(current: number[], newVec: number[], count: number): number[] {
    // Inkrementeller Centroid: new_centroid = old + (new_vec - old) / count
    return current.map((v, i) => v + ((newVec[i] || 0) - v) / count);
  }
}
```

### Rule-Generation

```typescript
class RuleGenerator {
  generateRules(patterns: Pattern[], config: LearningConfig): Rule[] {
    return patterns
      .filter(p =>
        p.occurrences >= config.minOccurrences &&
        p.confidence >= config.minConfidence &&
        p.successRate >= config.minSuccessRate
      )
      .map(pattern => ({
        name: `Auto: ${pattern.errorTemplate.substring(0, 50)}`,
        description: `Automatisch generiert aus ${pattern.occurrences} Vorkommen`,
        pattern: {
          error_type: pattern.errorType,
          message_pattern: pattern.messageRegex,
          file_pattern: pattern.filePattern,
        },
        action: {
          type: pattern.confidence >= 0.90 ? 'auto_fix' : 'suggestion',
          solution_ids: pattern.solutionIds,
          message: pattern.solutionSummary,
        },
        rule_type: pattern.confidence >= 0.90 ? 'auto_fix' : 'suggestion',
        confidence: pattern.confidence,
        source_error_ids: pattern.errorIds,
      }));
  }
}
```

### Lern-Zyklus

```typescript
class LearningEngine {
  private timer: NodeJS.Timeout | null = null;

  startSchedule(intervalMs: number): void {
    this.timer = setInterval(() => this.runCycle(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle(): Promise<LearningCycleResult> {
    const result: LearningCycleResult = {
      newPatterns: 0,
      updatedRules: 0,
      prunedRules: 0,
      crossProjectInsights: 0,
      newAntipatterns: 0,
    };

    // Phase 1: Neue Error-Solution-Paare sammeln (seit letztem Cycle)
    const newPairs = this.collectNewErrorSolutionPairs();

    // Phase 2: Confidence-Scores aller Solutions aktualisieren
    this.updateConfidenceScores();

    // Phase 3: Muster extrahieren (Centroid-basiertes Clustering)
    const patterns = this.patternExtractor.extractPatterns(newPairs);
    result.newPatterns = patterns.length;

    // Phase 4: Regeln generieren aus Mustern
    const newRules = this.ruleGenerator.generateRules(patterns, this.config);
    result.updatedRules = newRules.length;

    // Phase 5: Schwache Regeln beschneiden
    // Entferne: Confidence < 0.20 ODER Ablehnungsrate > 50%
    result.prunedRules = this.pruneRules();

    // Phase 6: Anti-Patterns erkennen
    // Wiederholte Fehler OHNE erfolgreiche Lösung → Anti-Pattern Kandidat
    result.newAntipatterns = this.detectAntipatterns();

    // Phase 7: Cross-Projekt Analyse
    // Gleiche Fehler in verschiedenen Projekten → Lösung übertragbar?
    result.crossProjectInsights = this.analyzeCrossProject();

    // Phase 8: Code-Module Confidence aktualisieren
    // Reuse-Count, Adaptation-Outcomes → Confidence-Score
    this.updateModuleConfidence();

    // Phase 9: Notifications senden
    this.emitNotifications(result);

    return result;
  }

  private detectAntipatterns(): number {
    // Finde Fehler die >= 3x aufgetreten sind, aber keine erfolgreiche Lösung haben
    // → Kandidat für "Tu das nicht"-Regel
    const candidates = this.services.error.findUnresolvedRecurring(3);
    let count = 0;

    for (const error of candidates) {
      const failedAttempts = this.services.solution.getFailedAttempts(error.id);
      if (failedAttempts.length >= 2) {
        this.services.antipattern.create({
          description: `Wiederkehrender Fehler ohne Lösung: ${error.message_template || error.message}`,
          trigger_pattern: JSON.stringify({
            error_type: error.error_type,
            message_pattern: error.message_template,
          }),
          severity: failedAttempts.length >= 4 ? 'critical' : 'warning',
          learned_from_error_ids: JSON.stringify([error.id]),
          project_id: error.project_id,
          confidence: Math.min(0.9, 0.3 + failedAttempts.length * 0.15),
        });
        count++;
      }
    }
    return count;
  }
}
```

## Synapsen-Netzwerk

### Hebbsches Lernen: "Neurons that fire together, wire together"

Jede Aktion im System stärkt oder schwächt Synapsen:

```typescript
class SynapseManager {
  // Synapse erstellen oder stärken
  strengthen(
    source: { type: NodeType; id: number },
    target: { type: NodeType; id: number },
    synapseType: SynapseType,
    context?: Record<string, unknown>
  ): void {
    const existing = this.repo.find(source, target, synapseType);

    if (existing) {
      // Hebbsche Verstärkung: Gewicht wächst logarithmisch (nie über 1.0)
      const newWeight = Math.min(1.0,
        existing.weight + (1.0 - existing.weight) * this.config.learningRate
      );
      this.repo.update(existing.id, {
        weight: newWeight,
        activation_count: existing.activation_count + 1,
        last_activated_at: new Date().toISOString(),
      });
    } else {
      this.repo.create({
        source_type: source.type,
        source_id: source.id,
        target_type: target.type,
        target_id: target.id,
        synapse_type: synapseType,
        weight: this.config.initialWeight,  // Default: 0.1
        context: context ? JSON.stringify(context) : null,
      });
    }
  }

  // Synapse schwächen (bei Fehlschlag oder Ablehnung)
  weaken(synapseId: number, factor = 0.5): void {
    const synapse = this.repo.getById(synapseId);
    if (!synapse) return;

    const newWeight = synapse.weight * factor;
    if (newWeight < this.config.pruneThreshold) {
      // Zu schwach → Synapse entfernen
      this.repo.delete(synapseId);
    } else {
      this.repo.update(synapseId, { weight: newWeight });
    }
  }

  // Zeitbasierter Verfall aller Synapsen (im Learning Cycle)
  decayAll(): number {
    // Gewicht *= decay_factor für alle Synapsen die seit X Tagen nicht aktiviert wurden
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.decayAfterDays);

    const stale = this.repo.findInactiveSince(cutoff.toISOString());
    let pruned = 0;

    for (const synapse of stale) {
      const decay = timeDecay(
        new Date(synapse.last_activated_at),
        this.config.decayHalfLifeDays
      );
      const newWeight = synapse.weight * decay;

      if (newWeight < this.config.pruneThreshold) {
        this.repo.delete(synapse.id);
        pruned++;
      } else {
        this.repo.update(synapse.id, { weight: newWeight });
      }
    }
    return pruned;
  }
}
```

### Wann werden Synapsen erstellt?

```typescript
// In den Event-Listeners des BrainCore:

// Error gemeldet → Synapse zu Projekt
eventBus.on('error:reported', ({ errorId, projectId }) => {
  synapseManager.strengthen(
    { type: 'error', id: errorId },
    { type: 'project', id: projectId },
    'co_occurs'
  );
});

// Solution löst Error → starke Synapse
eventBus.on('solution:applied', ({ solutionId, errorId, outcome }) => {
  if (outcome === 'success') {
    synapseManager.strengthen(
      { type: 'solution', id: solutionId },
      { type: 'error', id: errorId },
      'solves',
      { outcome: 'success' }
    );
  } else if (outcome === 'failure') {
    // Schwäche die Synapse bei Fehlschlag
    const synapse = synapseManager.find(
      { type: 'solution', id: solutionId },
      { type: 'error', id: errorId },
      'solves'
    );
    if (synapse) synapseManager.weaken(synapse.id, 0.7);
  }
});

// Gleicher Error in zwei Projekten → cross_project Synapse
eventBus.on('error:cross_project_match', ({ errorId1, errorId2, projectId1, projectId2 }) => {
  synapseManager.strengthen(
    { type: 'error', id: errorId1 },
    { type: 'error', id: errorId2 },
    'similar_to'
  );
  synapseManager.strengthen(
    { type: 'project', id: projectId1 },
    { type: 'project', id: projectId2 },
    'cross_project'
  );
});

// Code-Modul wiederverwendet → starke Synapse
eventBus.on('module:reused', ({ moduleId, projectId, outcome }) => {
  synapseManager.strengthen(
    { type: 'code_module', id: moduleId },
    { type: 'project', id: projectId },
    'uses_module',
    { outcome }
  );
});

// Solution nutzt Code-Modul → Synapse
eventBus.on('solution:uses_code', ({ solutionId, moduleId }) => {
  synapseManager.strengthen(
    { type: 'solution', id: solutionId },
    { type: 'code_module', id: moduleId },
    'uses_module'
  );
});

// Rule verhindert Error → Synapse stärken
eventBus.on('rule:prevented', ({ ruleId, errorId }) => {
  synapseManager.strengthen(
    { type: 'rule', id: ruleId },
    { type: 'error', id: errorId },
    'prevents'
  );
});

// Error tritt kurz nach anderem Error auf → causal Synapse
eventBus.on('error:chain_detected', ({ causeErrorId, effectErrorId }) => {
  synapseManager.strengthen(
    { type: 'error', id: causeErrorId },
    { type: 'error', id: effectErrorId },
    'causes'
  );
});
```

### Spreading Activation (Pfade durch das Netzwerk finden)

```typescript
class SpreadingActivation {
  // Finde alles was mit einem Knoten zusammenhängt, gewichtet nach Stärke
  activate(
    startNode: { type: NodeType; id: number },
    maxDepth = 3,
    minWeight = 0.2
  ): ActivationResult[] {
    const visited = new Set<string>();
    const results: ActivationResult[] = [];
    const queue: Array<{
      node: { type: NodeType; id: number };
      depth: number;
      pathWeight: number;
      path: string[];
    }> = [{ node: startNode, depth: 0, pathWeight: 1.0, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.node.type}:${current.node.id}`;

      if (visited.has(key)) continue;
      if (current.depth > maxDepth) continue;
      if (current.pathWeight < minWeight) continue;

      visited.add(key);

      if (current.depth > 0) {
        results.push({
          node: current.node,
          activation: current.pathWeight,
          depth: current.depth,
          path: current.path,
        });
      }

      // Alle Synapsen von diesem Knoten holen
      const synapses = this.repo.getOutgoing(current.node.type, current.node.id);

      for (const synapse of synapses) {
        const nextWeight = current.pathWeight * synapse.weight;
        if (nextWeight >= minWeight) {
          queue.push({
            node: { type: synapse.target_type, id: synapse.target_id },
            depth: current.depth + 1,
            pathWeight: nextWeight,
            path: [...current.path, `--${synapse.synapse_type}-->`],
          });
        }
      }
    }

    // Sortiere nach Aktivierungsstärke
    return results.sort((a, b) => b.activation - a.activation);
  }

  // Finde den stärksten Pfad zwischen zwei Knoten
  findPath(
    from: { type: NodeType; id: number },
    to: { type: NodeType; id: number },
    maxDepth = 5
  ): SynapsePath | null {
    // BFS mit Gewichts-Tracking
    const visited = new Set<string>();
    const queue: Array<{
      node: { type: NodeType; id: number };
      path: SynapseRecord[];
      totalWeight: number;
    }> = [{ node: from, path: [], totalWeight: 1.0 }];

    let bestPath: SynapsePath | null = null;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.node.type}:${current.node.id}`;

      if (visited.has(key)) continue;
      visited.add(key);

      if (current.node.type === to.type && current.node.id === to.id) {
        if (!bestPath || current.totalWeight > bestPath.totalWeight) {
          bestPath = {
            from, to,
            synapses: current.path,
            totalWeight: current.totalWeight,
            hops: current.path.length,
          };
        }
        continue;
      }

      if (current.path.length >= maxDepth) continue;

      const synapses = this.repo.getOutgoing(current.node.type, current.node.id);
      for (const synapse of synapses) {
        queue.push({
          node: { type: synapse.target_type, id: synapse.target_id },
          path: [...current.path, synapse],
          totalWeight: current.totalWeight * synapse.weight,
        });
      }
    }

    return bestPath;
  }
}
```

### Synapse-Queries (häufige Abfragen)

```typescript
class SynapseService {
  // "Was weiß Brain alles über diesen Error?"
  getErrorContext(errorId: number): ErrorContext {
    const activation = this.spreading.activate(
      { type: 'error', id: errorId },
      maxDepth: 3
    );

    return {
      solutions: activation.filter(a => a.node.type === 'solution'),
      relatedErrors: activation.filter(a => a.node.type === 'error'),
      relevantModules: activation.filter(a => a.node.type === 'code_module'),
      preventionRules: activation.filter(a => a.node.type === 'rule'),
      insights: activation.filter(a => a.node.type === 'insight'),
      antipatterns: activation.filter(a => a.node.type === 'antipattern'),
    };
  }

  // "Wie hängen Projekt A und Projekt B zusammen?"
  getProjectRelation(projectIdA: number, projectIdB: number): ProjectRelation {
    const path = this.spreading.findPath(
      { type: 'project', id: projectIdA },
      { type: 'project', id: projectIdB }
    );

    const sharedErrors = this.repo.findConnected('project', projectIdA, 'project', projectIdB, 'error');
    const sharedModules = this.repo.findConnected('project', projectIdA, 'project', projectIdB, 'code_module');

    return { path, sharedErrors, sharedModules };
  }

  // "Was sind die stärksten Verbindungen im ganzen Netzwerk?"
  getStrongestSynapses(limit = 20): SynapseRecord[] {
    return this.repo.findByWeight(limit);
  }

  // Netzwerk-Statistiken
  getNetworkStats(): NetworkStats {
    return {
      totalNodes: this.repo.countNodes(),
      totalSynapses: this.repo.countSynapses(),
      avgWeight: this.repo.avgWeight(),
      strongSynapses: this.repo.countByWeightThreshold(0.7),
      weakSynapses: this.repo.countByWeightThreshold(0.2, 'below'),
      synapsesByType: this.repo.countByType(),
    };
  }
}
```

## Research Brain (Forscher-Hirn)

Das Research Brain läuft als eigener Scheduled Cycle (langsamer als Learning Engine, z.B. alle 60 Minuten) und analysiert das Gesamtnetzwerk aus Errors, Solutions, Code-Modulen und Synapsen.

### Forschungs-Zyklus

```typescript
class ResearchEngine {
  private timer: NodeJS.Timeout | null = null;

  startSchedule(intervalMs: number): void {
    // Erster Cycle nach 5 Minuten (Brain soll erstmal Daten sammeln)
    setTimeout(() => {
      this.runCycle();
      this.timer = setInterval(() => this.runCycle(), intervalMs);
    }, 5 * 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle(): Promise<ResearchCycleResult> {
    const result: ResearchCycleResult = {
      trendsFound: 0,
      patternsFound: 0,
      gapsFound: 0,
      synergiesFound: 0,
      templatesFound: 0,
      suggestionsGenerated: 0,
    };

    // Phase 1: Trend-Analyse
    // Was wird besser? Was wird schlechter? Zeitreihen über Error-Frequenz, Solution-Erfolgsrate
    result.trendsFound = await this.analyzeTrends();

    // Phase 2: Gap-Analyse
    // Wiederkehrende ungelöste Probleme, fehlende Module, schwache Synapsen
    result.gapsFound = await this.analyzeGaps();

    // Phase 3: Synergie-Detektion
    // Module die zusammen stark sind, Projekte die voneinander lernen können
    result.synergiesFound = await this.detectSynergies();

    // Phase 4: Template-Extraktion
    // Wiederholte Code-Patterns die zu Templates generalisiert werden können
    result.templatesFound = await this.extractTemplates();

    // Phase 5: Projekt-Vorschläge
    // Basierend auf vorhandenen Modulen und Patterns: was könnte man noch bauen?
    result.suggestionsGenerated = await this.generateSuggestions();

    // Phase 6: Insight-Prioritisierung
    // Bestehende Insights neu bewerten, abgelaufene entfernen
    await this.prioritizeInsights();

    // Phase 7: Synapsen-Pflege
    // Schwache Synapsen prunen, starke Cluster identifizieren
    await this.synapseManager.decayAll();

    return result;
  }
}
```

### Trend-Analyse

```typescript
class TrendAnalyzer {
  analyze(): Insight[] {
    const insights: Insight[] = [];
    const projects = this.projectRepo.getAll();

    for (const project of projects) {
      // Error-Frequenz über Zeit (letzte 7 Tage vs. 7 Tage davor)
      const recentErrors = this.errorRepo.countSince(project.id, 7);
      const previousErrors = this.errorRepo.countBetween(project.id, 14, 7);

      if (previousErrors > 0) {
        const changeRate = (recentErrors - previousErrors) / previousErrors;

        if (changeRate < -0.3) {
          insights.push({
            insight_type: 'trend',
            title: `Error-Rate in ${project.name} sinkt`,
            description: `${Math.round(-changeRate * 100)}% weniger Fehler in den letzten 7 Tagen vs. Vorwoche. Was auch immer du machst - es funktioniert.`,
            evidence: JSON.stringify({ recentErrors, previousErrors, changeRate }),
            confidence: Math.min(0.9, 0.5 + Math.abs(changeRate) * 0.5),
            priority: 'low',
          });
        } else if (changeRate > 0.5) {
          insights.push({
            insight_type: 'trend',
            title: `Error-Rate in ${project.name} steigt stark`,
            description: `${Math.round(changeRate * 100)}% mehr Fehler. Mögliche Ursachen prüfen: neue Dependencies, Refactoring, API-Änderungen.`,
            evidence: JSON.stringify({ recentErrors, previousErrors, changeRate }),
            confidence: Math.min(0.9, 0.5 + changeRate * 0.3),
            priority: 'high',
          });
        }
      }

      // Solution-Erfolgsrate-Trend
      const recentSuccessRate = this.solutionRepo.successRate(project.id, 14);
      const overallSuccessRate = this.solutionRepo.successRate(project.id);

      if (recentSuccessRate < overallSuccessRate - 0.15) {
        insights.push({
          insight_type: 'trend',
          title: `Lösungsqualität in ${project.name} sinkt`,
          description: `Aktuelle Erfolgsrate ${Math.round(recentSuccessRate * 100)}% vs. Durchschnitt ${Math.round(overallSuccessRate * 100)}%. Lösungen werden weniger effektiv.`,
          evidence: JSON.stringify({ recentSuccessRate, overallSuccessRate }),
          confidence: 0.7,
          priority: 'medium',
          actionable: true,
          suggested_action: JSON.stringify({
            action: 'review_recent_solutions',
            message: 'Letzte Lösungen prüfen - stimmen die Ansätze noch?',
          }),
        });
      }
    }

    return insights;
  }
}
```

### Gap-Analyse

```typescript
class GapAnalyzer {
  analyze(): Insight[] {
    const insights: Insight[] = [];

    // 1. Wiederkehrende ungelöste Errors
    const unresolvedRecurring = this.errorRepo.findUnresolvedRecurring(5);
    for (const error of unresolvedRecurring) {
      insights.push({
        insight_type: 'gap',
        title: `Ungelöster wiederkehrender Fehler: ${error.error_type}`,
        description: `"${error.message.substring(0, 80)}..." ist ${error.occurrence_count}x aufgetreten und hat keine erfolgreiche Lösung. Das kostet Zeit.`,
        evidence: JSON.stringify({ errorId: error.id, occurrences: error.occurrence_count }),
        confidence: Math.min(0.95, 0.5 + error.occurrence_count * 0.1),
        priority: error.occurrence_count >= 10 ? 'critical' : 'high',
        actionable: true,
        suggested_action: JSON.stringify({
          action: 'investigate_error',
          error_id: error.id,
          message: 'Grundursache untersuchen und nachhaltige Lösung finden',
        }),
      });
    }

    // 2. Fehlende Code-Module (Funktionalität die in mehreren Projekten gebraucht wird)
    const commonErrors = this.findCommonErrorPatternsAcrossProjects();
    for (const pattern of commonErrors) {
      if (pattern.projectCount >= 2 && !pattern.hasSolution) {
        insights.push({
          insight_type: 'gap',
          title: `Gemeinsames Problem ohne gemeinsame Lösung`,
          description: `${pattern.projectCount} Projekte haben "${pattern.errorTemplate}" - aber kein geteiltes Modul löst das.`,
          confidence: 0.7,
          priority: 'medium',
          actionable: true,
          suggested_action: JSON.stringify({
            action: 'create_shared_module',
            message: `Shared utility erstellen das ${pattern.errorTemplate} in allen Projekten verhindert`,
          }),
        });
      }
    }

    // 3. Schwache Synapsen-Cluster (isolierte Knoten ohne Verbindungen)
    const isolated = this.synapseRepo.findIsolatedNodes();
    if (isolated.errors.length > 5) {
      insights.push({
        insight_type: 'gap',
        title: `${isolated.errors.length} Fehler ohne Vernetzung`,
        description: `Diese Fehler haben keine Synapsen zu Lösungen, Modulen oder anderen Fehlern. Brain kann sie nicht einordnen.`,
        confidence: 0.6,
        priority: 'low',
      });
    }

    return insights;
  }
}
```

### Synergie-Detektion

```typescript
class SynergyDetector {
  detect(): Insight[] {
    const insights: Insight[] = [];

    // 1. Module die zusammen genutzt werden (starke co_occurs Synapsen)
    const modulePairs = this.synapseRepo.findStrongPairs('code_module', 'code_module', 'co_occurs', 0.5);
    for (const pair of modulePairs) {
      insights.push({
        insight_type: 'synergy',
        title: `Module "${pair.sourceName}" + "${pair.targetName}" sind ein starkes Team`,
        description: `Diese Module werden in ${pair.coUsageCount} Projekten zusammen genutzt. Zusammen als Package veröffentlichen?`,
        evidence: JSON.stringify(pair),
        confidence: Math.min(0.9, pair.weight),
        priority: 'medium',
        actionable: true,
        suggested_action: JSON.stringify({
          action: 'combine_modules',
          module_ids: [pair.sourceId, pair.targetId],
          message: 'Zu einem kombinierten Package zusammenfassen',
        }),
      });
    }

    // 2. Projekte die voneinander lernen können
    const projectPairs = this.findProjectSynergies();
    for (const pair of projectPairs) {
      if (pair.transferableSolutions.length >= 2) {
        insights.push({
          insight_type: 'synergy',
          title: `${pair.projectA.name} hat Lösungen die ${pair.projectB.name} braucht`,
          description: `${pair.transferableSolutions.length} Lösungen aus ${pair.projectA.name} könnten in ${pair.projectB.name} helfen.`,
          evidence: JSON.stringify(pair.transferableSolutions.map(s => s.id)),
          confidence: 0.7,
          priority: 'medium',
          actionable: true,
        });
      }
    }

    // 3. Error-Solution-Chains die sich zu einem Workflow zusammensetzen lassen
    const workflows = this.findWorkflowPatterns();
    for (const wf of workflows) {
      insights.push({
        insight_type: 'synergy',
        title: `Wiederkehrender Workflow erkannt: ${wf.name}`,
        description: `Die Sequenz ${wf.steps.join(' → ')} wiederholt sich. Automatisierung möglich?`,
        evidence: JSON.stringify(wf),
        confidence: wf.occurrences >= 3 ? 0.8 : 0.5,
        priority: wf.occurrences >= 5 ? 'high' : 'medium',
        actionable: true,
        suggested_action: JSON.stringify({
          action: 'automate_workflow',
          steps: wf.steps,
          message: 'Script oder Template erstellen das diese Sequenz automatisiert',
        }),
      });
    }

    return insights;
  }
}
```

### Template-Extraktion

```typescript
class TemplateExtractor {
  extract(): Insight[] {
    const insights: Insight[] = [];

    // Finde Code-Module die in >= 3 Projekten in adaptierter Form existieren
    const adaptedModules = this.codeModuleRepo.findWithMultipleAdaptations(3);

    for (const group of adaptedModules) {
      // Extrahiere das Gemeinsame aus allen Adaptationen
      const commonStructure = this.findCommonStructure(group.modules);

      if (commonStructure.similarity >= 0.6) {
        insights.push({
          insight_type: 'template_candidate',
          title: `Template-Kandidat: "${group.baseName}"`,
          description: `${group.modules.length} Varianten in ${group.projectCount} Projekten. Gemeinsame Struktur: ${Math.round(commonStructure.similarity * 100)}%. Ein parametrisiertes Template würde Duplikation eliminieren.`,
          evidence: JSON.stringify({
            moduleIds: group.modules.map(m => m.id),
            commonParts: commonStructure.commonParts,
            variableParts: commonStructure.variableParts,
          }),
          confidence: commonStructure.similarity,
          priority: group.projectCount >= 3 ? 'high' : 'medium',
          actionable: true,
          suggested_action: JSON.stringify({
            action: 'create_template',
            base_module_id: group.bestModule.id,
            parameters: commonStructure.variableParts,
            message: `Template erstellen mit Parametern: ${commonStructure.variableParts.join(', ')}`,
          }),
        });

        // Synapse: Template-Insight → alle beteiligten Module
        for (const mod of group.modules) {
          this.synapseManager.strengthen(
            { type: 'insight', id: insights[insights.length - 1].id! },
            { type: 'code_module', id: mod.id },
            'generalizes'
          );
        }
      }
    }

    return insights;
  }
}
```

### Projekt-Vorschläge

```typescript
class ProjectSuggestionGenerator {
  generate(): Insight[] {
    const insights: Insight[] = [];
    const modules = this.codeModuleRepo.getAll();
    const projects = this.projectRepo.getAll();

    // 1. Analyse: Welche Funktionalität existiert bereits verteilt?
    const capabilities = this.categorizeModules(modules);

    // Beispiel: Wenn du auth, database, api-client, validation hast → "Du könntest ein Backend-Template bauen"
    const templateSuggestions = this.checkForProjectTemplates(capabilities);
    for (const suggestion of templateSuggestions) {
      insights.push({
        insight_type: 'project_suggestion',
        title: suggestion.title,
        description: suggestion.description,
        evidence: JSON.stringify(suggestion.modules),
        confidence: suggestion.coverage,
        priority: suggestion.coverage >= 0.7 ? 'medium' : 'low',
        actionable: true,
        suggested_action: JSON.stringify({
          action: 'create_project_template',
          modules: suggestion.modules,
          message: suggestion.description,
        }),
      });
    }

    // 2. Schwachstellen die ein eigenes Tool verdienen
    const recurringPain = this.findRecurringPainPoints();
    for (const pain of recurringPain) {
      insights.push({
        insight_type: 'project_suggestion',
        title: `Tool-Idee: ${pain.suggestedToolName}`,
        description: `Du verbringst wiederholt Zeit mit "${pain.description}". Ein dediziertes Tool könnte das automatisieren.`,
        evidence: JSON.stringify(pain.evidence),
        confidence: pain.confidence,
        priority: pain.timeWasted >= 10 ? 'high' : 'medium',
        actionable: true,
      });
    }

    return insights;
  }

  private checkForProjectTemplates(
    capabilities: Map<string, CodeModule[]>
  ): ProjectTemplateSuggestion[] {
    const suggestions: ProjectTemplateSuggestion[] = [];

    // Bekannte Kombinationen die ein Projekt ergeben
    const templates: Array<{ name: string; required: string[]; optional: string[] }> = [
      {
        name: 'REST API Template',
        required: ['http-server', 'routing', 'database', 'validation'],
        optional: ['auth', 'logging', 'rate-limiting', 'caching'],
      },
      {
        name: 'CLI Tool Template',
        required: ['argument-parsing', 'config', 'logging'],
        optional: ['interactive-prompts', 'progress-bar', 'file-operations'],
      },
      {
        name: 'Data Pipeline Template',
        required: ['file-reading', 'data-transformation', 'output-writing'],
        optional: ['validation', 'error-handling', 'progress-tracking'],
      },
    ];

    for (const template of templates) {
      const foundRequired = template.required.filter(r => capabilities.has(r));
      const foundOptional = template.optional.filter(o => capabilities.has(o));
      const coverage = foundRequired.length / template.required.length;

      if (coverage >= 0.5) {
        suggestions.push({
          title: template.name,
          description: `Du hast ${foundRequired.length}/${template.required.length} Kern-Module und ${foundOptional.length} Extras. ${coverage >= 0.75 ? 'Fast komplett!' : 'Guter Anfang.'}`,
          modules: [...foundRequired, ...foundOptional].flatMap(c => capabilities.get(c) || []),
          coverage,
        });
      }
    }

    return suggestions;
  }
}
```

## Error-Parser Registry

```typescript
interface ErrorParser {
  name: string;
  priority: number;                     // Höher = wird zuerst versucht
  canParse: (input: string) => boolean; // Kann dieser Parser den Input verarbeiten?
  parse: (input: string) => ParsedError | null;
}

interface ParsedError {
  errorType: string;
  message: string;
  stackTrace?: string;
  frames: StackFrame[];
  sourceFile?: string;
  sourceLine?: number;
  language?: string;
}

class ErrorParserRegistry {
  private parsers: ErrorParser[] = [];

  register(parser: ErrorParser): void {
    this.parsers.push(parser);
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  parse(input: string): ParsedError | null {
    for (const parser of this.parsers) {
      if (parser.canParse(input)) {
        const result = parser.parse(input);
        if (result) return result;
      }
    }
    return null;
  }
}

// Beispiel: Node.js Parser
const nodeParser: ErrorParser = {
  name: 'node',
  priority: 10,
  canParse: (input) =>
    /at .+ \(.+:\d+:\d+\)/.test(input) ||   // V8 Stack-Trace
    /^\w*Error:/.test(input) ||              // Error: ...
    /^\w*TypeError:/.test(input),            // TypeError: ...
  parse: (input) => {
    const messageMatch = input.match(/^(\w+(?:Error|Exception)?): (.+)$/m);
    if (!messageMatch) return null;

    const frames: StackFrame[] = [];
    const frameRegex = /at (?:(.+?) )?\((.+?):(\d+):(\d+)\)/g;
    let match;
    while ((match = frameRegex.exec(input)) !== null) {
      frames.push({
        function_name: match[1] || '<anonymous>',
        file_path: match[2],
        line_number: parseInt(match[3]),
        column_number: parseInt(match[4]),
      });
    }

    return {
      errorType: messageMatch[1],
      message: messageMatch[2],
      stackTrace: input,
      frames,
      sourceFile: frames[0]?.file_path,
      sourceLine: frames[0]?.line_number,
      language: 'javascript',
    };
  }
};

// Beispiel: Python Parser
const pythonParser: ErrorParser = {
  name: 'python',
  priority: 10,
  canParse: (input) =>
    /Traceback \(most recent call last\)/.test(input) ||
    /File ".+", line \d+/.test(input),
  parse: (input) => {
    const frames: StackFrame[] = [];
    const frameRegex = /File "(.+?)", line (\d+), in (.+)/g;
    let match;
    while ((match = frameRegex.exec(input)) !== null) {
      frames.push({
        function_name: match[3],
        file_path: match[1],
        line_number: parseInt(match[2]),
      });
    }

    const errorMatch = input.match(/^(\w+(?:Error|Exception)?): (.+)$/m);
    return {
      errorType: errorMatch?.[1] || 'Error',
      message: errorMatch?.[2] || input.split('\n').pop() || input,
      stackTrace: input,
      frames,
      sourceFile: frames[frames.length - 1]?.file_path,
      sourceLine: frames[frames.length - 1]?.line_number,
      language: 'python',
    };
  }
};

// Beispiel: Shell Parser
const shellParser: ErrorParser = {
  name: 'shell',
  priority: 5,
  canParse: (input) =>
    /command not found/.test(input) ||
    /Permission denied/.test(input) ||
    /No such file or directory/.test(input) ||
    /ENOENT|EACCES|ECONNREFUSED/.test(input),
  parse: (input) => {
    const message = input.split('\n')[0].trim();
    let errorType = 'ShellError';
    if (/command not found/.test(input)) errorType = 'CommandNotFound';
    if (/Permission denied|EACCES/.test(input)) errorType = 'PermissionError';
    if (/No such file|ENOENT/.test(input)) errorType = 'FileNotFound';
    if (/ECONNREFUSED/.test(input)) errorType = 'ConnectionRefused';

    return {
      errorType,
      message,
      frames: [],
      language: 'shell',
    };
  }
};

// Generischer Fallback
const genericParser: ErrorParser = {
  name: 'generic',
  priority: 0,
  canParse: () => true,                  // Fängt alles auf
  parse: (input) => {
    const firstLine = input.split('\n')[0].trim();
    const errorMatch = firstLine.match(/^(?:error|Error|ERROR)[\s:]+(.+)/i);
    return {
      errorType: 'GenericError',
      message: errorMatch?.[1] || firstLine,
      stackTrace: input.includes('\n') ? input : undefined,
      frames: [],
    };
  }
};
```

## IPC-Architektur

### Protocol (Length-prefixed JSON Framing)
```typescript
// Framing: [4 Byte Length (Big Endian)][JSON Payload]
// Kein Delimiter-Problem, keine partielle Message Issues

interface IpcMessage {
  id: string;                           // Request-ID für Response-Zuordnung
  type: 'request' | 'response' | 'notification';
  method?: string;                      // z.B. 'error.report', 'code.find'
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

function encodeMessage(msg: IpcMessage): Buffer {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

class MessageDecoder {
  private buffer = Buffer.alloc(0);

  feed(chunk: Buffer): IpcMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: IpcMessage[] = [];

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + length) break;

      const json = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      messages.push(JSON.parse(json));
    }
    return messages;
  }
}
```

### IPC Router
```typescript
const methods = {
  // Terminal Lifecycle
  'terminal.register':      (p) => terminalService.register(p),
  'terminal.heartbeat':     (p) => terminalService.heartbeat(p),
  'terminal.disconnect':    (p) => terminalService.disconnect(p),

  // Error Brain
  'error.report':           (p) => errorService.report(p),
  'error.query':            (p) => errorService.query(p),
  'error.match':            (p) => errorService.matchSimilar(p),
  'solution.report':        (p) => solutionService.report(p),
  'solution.query':         (p) => solutionService.query(p),
  'solution.rate':          (p) => solutionService.rateOutcome(p),
  'solution.attempt':       (p) => solutionService.reportAttempt(p),

  // Code Brain
  'code.analyze':           (p) => codeService.analyzeAndRegister(p),
  'code.find':              (p) => codeService.findReusable(p),
  'code.similarity':        (p) => codeService.checkSimilarity(p),
  'code.modules':           (p) => codeService.listModules(p),
  'code.usage':             (p) => codeService.reportUsage(p),

  // Prevention
  'prevention.check':       (p) => preventionService.checkRules(p),
  'prevention.antipatterns': (p) => preventionService.checkAntipatterns(p),

  // Synapsen
  'synapse.context':        (p) => synapseService.getErrorContext(p),
  'synapse.path':           (p) => synapseService.findPath(p),
  'synapse.related':        (p) => synapseService.getRelated(p),
  'synapse.stats':          (p) => synapseService.getNetworkStats(),

  // Research / Insights
  'research.insights':      (p) => researchService.getInsights(p),
  'research.suggest':       (p) => researchService.getSuggestions(p),
  'research.trends':        (p) => researchService.getTrends(p),

  // Notifications
  'notification.list':      (p) => notificationService.list(p),
  'notification.ack':       (p) => notificationService.acknowledge(p),

  // Analytics
  'analytics.summary':      (p) => analyticsService.getSummary(p),
  'analytics.network':      (p) => analyticsService.getNetworkOverview(p),
};
```

### Named Pipe Server
```typescript
import net from 'net';

class IpcServer {
  private server: net.Server;
  private clients = new Map<string, net.Socket>();

  constructor(
    private router: IpcRouter,
    private config: IpcConfig
  ) {}

  start(): void {
    this.server = net.createServer((socket) => {
      const clientId = randomUUID();
      this.clients.set(clientId, socket);
      const decoder = new MessageDecoder();

      socket.on('data', (chunk) => {
        const messages = decoder.feed(chunk);
        for (const msg of messages) {
          this.handleMessage(clientId, msg, socket);
        }
      });

      socket.on('close', () => {
        this.clients.delete(clientId);
      });

      socket.on('error', (err) => {
        logger.error(`Client ${clientId} error:`, err);
        this.clients.delete(clientId);
      });
    });

    this.server.listen(this.config.pipeName);
    logger.info(`IPC server listening on ${this.config.pipeName}`);
  }

  private async handleMessage(clientId: string, msg: IpcMessage, socket: net.Socket): Promise<void> {
    if (msg.type !== 'request' || !msg.method) return;

    try {
      const result = await this.router.handle(msg.method, msg.params);
      socket.write(encodeMessage({
        id: msg.id,
        type: 'response',
        result,
      }));
    } catch (err) {
      socket.write(encodeMessage({
        id: msg.id,
        type: 'response',
        error: { code: -1, message: String(err) },
      }));
    }
  }

  notify(terminalId: string | null, notification: IpcMessage): void {
    if (terminalId) {
      const socket = this.clients.get(terminalId);
      if (socket && !socket.destroyed) socket.write(encodeMessage(notification));
    } else {
      for (const socket of this.clients.values()) {
        if (!socket.destroyed) socket.write(encodeMessage(notification));
      }
    }
  }

  stop(): void {
    for (const socket of this.clients.values()) {
      socket.destroy();
    }
    this.server.close();
  }
}
```

## MCP Server

Der MCP Server läuft als eigener Prozess pro Claude-Session (stdio Transport). Er ist ein Thin Client der alle Anfragen via Named Pipe an den Brain Daemon weiterleitet.

### MCP Tool-Definitionen

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'brain',
  version: '1.0.0',
});

// === Error Brain Tools ===

server.tool(
  'brain_report_error',
  'Report an error that occurred. Brain will store it, match it against known errors, and return solutions if available.',
  {
    error_output: { type: 'string', description: 'The raw error output from the terminal' },
    command: { type: 'string', description: 'The command that caused the error' },
    task_context: { type: 'string', description: 'What was the user trying to accomplish' },
    working_directory: { type: 'string', description: 'Working directory when error occurred' },
  },
  async (params) => {
    const result = await ipcClient.request('error.report', params);
    // Sofort nach ähnlichen Fehlern suchen
    const matches = await ipcClient.request('error.match', { error_id: result.error_id });
    return formatErrorReportResponse(result, matches);
  }
);

server.tool(
  'brain_query_error',
  'Search for similar errors and their solutions in the Brain database.',
  {
    query: { type: 'string', description: 'Error message or description to search for' },
    project_only: { type: 'boolean', description: 'Only search in current project (default: false)' },
  },
  async (params) => {
    const results = await ipcClient.request('error.query', params);
    return formatErrorQueryResponse(results);
  }
);

server.tool(
  'brain_report_solution',
  'Report a successful solution for an error. Brain will learn from this.',
  {
    error_id: { type: 'number', description: 'The error ID this solution fixes' },
    title: { type: 'string', description: 'Short title of the solution' },
    description: { type: 'string', description: 'What was done to fix the error' },
    code_before: { type: 'string', description: 'Code before the fix (optional)' },
    code_after: { type: 'string', description: 'Code after the fix (optional)' },
    diff: { type: 'string', description: 'Diff of the changes (optional)' },
  },
  async (params) => {
    const result = await ipcClient.request('solution.report', params);
    return formatSolutionReportResponse(result);
  }
);

server.tool(
  'brain_report_attempt',
  'Report a failed solution attempt. Brain learns what does NOT work.',
  {
    error_id: { type: 'number', description: 'The error ID' },
    description: { type: 'string', description: 'What was tried' },
    reason: { type: 'string', description: 'Why it did not work' },
  },
  async (params) => {
    const result = await ipcClient.request('solution.attempt', params);
    return formatAttemptResponse(result);
  }
);

// === Code Brain Tools ===

server.tool(
  'brain_find_reusable_code',
  'Search for reusable code modules from other projects. Use when starting new functionality.',
  {
    purpose: { type: 'string', description: 'What the code should do (e.g., "retry with backoff", "JWT authentication")' },
    language: { type: 'string', description: 'Programming language' },
    category: { type: 'string', description: 'Category: utility, middleware, config, hook, component, service (optional)' },
  },
  async (params) => {
    const results = await ipcClient.request('code.find', params);
    return formatCodeSearchResponse(results);
  }
);

server.tool(
  'brain_register_code',
  'Register a code module as reusable. Brain will analyze it and make it available to other projects.',
  {
    source_code: { type: 'string', description: 'The source code' },
    file_path: { type: 'string', description: 'File path relative to project root' },
    name: { type: 'string', description: 'Module name (optional - Brain will auto-detect)' },
    purpose: { type: 'string', description: 'What this code does (optional - Brain will analyze)' },
  },
  async (params) => {
    const result = await ipcClient.request('code.analyze', params);
    return formatCodeRegisterResponse(result);
  }
);

server.tool(
  'brain_check_code_similarity',
  'Check if similar code already exists in other projects before writing new code.',
  {
    source_code: { type: 'string', description: 'The code to check' },
    file_path: { type: 'string', description: 'File path for context' },
  },
  async (params) => {
    const results = await ipcClient.request('code.similarity', params);
    return formatSimilarityResponse(results);
  }
);

// === Synapsen-Netzwerk Tools ===

server.tool(
  'brain_explore',
  'Explore what Brain knows about a topic. Uses spreading activation through the synapse network to find connected errors, solutions, modules, and insights.',
  {
    node_type: { type: 'string', description: 'Type: error, solution, code_module, project' },
    node_id: { type: 'number', description: 'ID of the node to explore from' },
    max_depth: { type: 'number', description: 'How many hops to follow (default: 3)' },
  },
  async (params) => {
    const context = await ipcClient.request('synapse.context', params);
    return formatExploreResponse(context);
  }
);

server.tool(
  'brain_connections',
  'Find how two things are connected in Brain (e.g., how an error relates to a code module).',
  {
    from_type: { type: 'string', description: 'Source type: error, solution, code_module, project' },
    from_id: { type: 'number', description: 'Source ID' },
    to_type: { type: 'string', description: 'Target type' },
    to_id: { type: 'number', description: 'Target ID' },
  },
  async (params) => {
    const path = await ipcClient.request('synapse.path', params);
    return formatPathResponse(path);
  }
);

// === Research Brain Tools ===

server.tool(
  'brain_insights',
  'Get research insights: trends, gaps, synergies, template candidates, and project suggestions.',
  {
    type: { type: 'string', description: 'Filter by type: trend, pattern, gap, synergy, optimization, template_candidate, project_suggestion, warning (optional)' },
    priority: { type: 'string', description: 'Minimum priority: low, medium, high, critical (optional)' },
  },
  async (params) => {
    const insights = await ipcClient.request('research.insights', params);
    return formatInsightsResponse(insights);
  }
);

server.tool(
  'brain_suggest',
  'Ask Brain for suggestions: what to build next, what to improve, what patterns to extract.',
  {
    context: { type: 'string', description: 'Current context or question (e.g., "starting new project", "looking for optimizations")' },
  },
  async (params) => {
    const suggestions = await ipcClient.request('research.suggest', params);
    return formatSuggestionsResponse(suggestions);
  }
);

// === Status & Notifications ===

server.tool(
  'brain_status',
  'Get current Brain status: connected terminals, error count, solutions, code modules, synapse network, and research insights.',
  {},
  async () => {
    const summary = await ipcClient.request('analytics.summary', {});
    const network = await ipcClient.request('synapse.stats', {});
    const notifications = await ipcClient.request('notification.list', { unacknowledged: true });
    return formatStatusResponse(summary, network, notifications);
  }
);

server.tool(
  'brain_notifications',
  'Get pending notifications (new solutions, recurring errors, research insights, synergy suggestions).',
  {},
  async () => {
    const notifications = await ipcClient.request('notification.list', { unacknowledged: true });
    return formatNotificationsResponse(notifications);
  }
);

// Server starten
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Claude Code Hooks

### Hook-Konfiguration

In jeder Projekt-`.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": "Bash" },
        "command": "node /path/to/brain/dist/hooks/post-tool-use.js"
      }
    ]
  }
}
```

Oder global in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": "Bash" },
        "command": "node /path/to/brain/dist/hooks/post-tool-use.js"
      }
    ]
  }
}
```

### Hook-Script (auto-detect.ts)

```typescript
// hooks/post-tool-use.ts
// Wird nach jedem Bash-Tool-Aufruf ausgeführt
// Erhält Tool-Input und Output via stdin als JSON

import { IpcClient } from '../ipc/client.js';

interface HookInput {
  tool_name: string;
  tool_input: { command: string };
  tool_output: string;
  exit_code?: number;
}

async function main() {
  // Hook-Input von stdin lesen
  const input: HookInput = JSON.parse(await readStdin());

  // Nur bei Fehlern reagieren
  if (!isError(input)) return;

  const client = new IpcClient();
  try {
    await client.connect();

    // Error an Brain melden
    const result = await client.request('error.report', {
      raw_output: input.tool_output,
      command: input.tool_input.command,
      auto_detected: true,
    });

    // Wenn Brain eine Lösung kennt, als Feedback ausgeben
    if (result.matches?.length > 0) {
      const best = result.matches[0];
      console.log(`Brain: Similar error found (#${best.error_id}, ${Math.round(best.score * 100)}% match)`);
      if (best.solutions?.length > 0) {
        console.log(`Brain: Solution available - use brain_query_error to see details`);
      }
    }

    // Anti-Pattern Check
    const antipatterns = await client.request('prevention.antipatterns', {
      error_output: input.tool_output,
    });
    if (antipatterns?.length > 0) {
      console.log(`Brain WARNING: Known anti-pattern detected: ${antipatterns[0].description}`);
    }

  } catch {
    // Hook darf nie den Workflow blockieren - stille Fehler
  } finally {
    client.disconnect();
  }
}

function isError(input: HookInput): boolean {
  // Exit-Code Check
  if (input.exit_code !== undefined && input.exit_code !== 0) return true;

  // Pattern-Check im Output
  const errorPatterns = [
    /Error:/i,
    /error\[E\d+\]/,                    // Rust errors
    /Traceback \(most recent call last\)/,
    /FATAL|PANIC/i,
    /npm ERR!/,
    /SyntaxError|TypeError|ReferenceError|RangeError/,
    /ENOENT|EACCES|ECONNREFUSED|ETIMEDOUT/,
    /ModuleNotFoundError|ImportError/,
    /failed to compile/i,
    /BUILD FAILED/i,
    /Cannot find module/,
    /command not found/,
    /Permission denied/,
  ];

  return errorPatterns.some(p => p.test(input.tool_output));
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

main();
```

### Auto-Detection für Code Brain (PostToolUse auf Write/Edit)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": "Bash" },
        "command": "node /path/to/brain/dist/hooks/post-tool-use.js"
      },
      {
        "matcher": { "tool_name": "Write" },
        "command": "node /path/to/brain/dist/hooks/post-write.js"
      },
      {
        "matcher": { "tool_name": "Edit" },
        "command": "node /path/to/brain/dist/hooks/post-edit.js"
      }
    ]
  }
}
```

```typescript
// hooks/post-write.ts
// Analysiert geschriebene Dateien auf Wiederverwendbarkeit

async function main() {
  const input = JSON.parse(await readStdin());
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;

  // Nur Source-Code-Dateien analysieren
  if (!isSourceFile(filePath)) return;

  const client = new IpcClient();
  try {
    await client.connect();

    // Code auf Ähnlichkeit prüfen
    const similarities = await client.request('code.similarity', {
      file_path: filePath,
      source_code: input.tool_input.content,
    });

    if (similarities?.length > 0) {
      const best = similarities[0];
      console.log(`Brain: Similar code exists in ${best.project_name}/${best.file_path} (${Math.round(best.score * 100)}% match)`);
    }

    // Reusability-Check
    const analysis = await client.request('code.analyze', {
      file_path: filePath,
      source_code: input.tool_input.content,
      dry_run: true,  // Nur analysieren, nicht registrieren
    });

    if (analysis?.reusability_score >= 0.60) {
      console.log(`Brain: This code looks reusable (score: ${Math.round(analysis.reusability_score * 100)}%). Consider registering it.`);
    }
  } catch {
    // Stille Fehler
  } finally {
    client.disconnect();
  }
}
```

## Terminal-Lifecycle

```
┌─────────────┐     register      ┌──────────────┐
│  Connecting  │ ─────────────►   │  Connected   │
└─────────────┘                   └──────┬───────┘
                                         │
                              heartbeat (30s) │
                                         │
                                  ┌──────▼───────┐
                                  │    Active     │◄── error.report
                                  │              │◄── solution.report
                                  │              │◄── code.analyze
                                  │              │◄── prevention.check
                                  └──────┬───────┘
                                         │
                               disconnect/timeout │
                                         │
                                  ┌──────▼───────┐
                                  │ Disconnected  │
                                  └──────────────┘
                                         │
                                300s no heartbeat │  (5 min statt 90s)
                                         │
                                  ┌──────▼───────┐
                                  │    Stale      │ → Cleanup
                                  └──────────────┘
```

## BrainCore Orchestrierung

```typescript
class BrainCore {
  private db: Database;
  private ipcServer: IpcServer;
  private learningEngine: LearningEngine;
  private researchEngine: ResearchEngine;
  private synapseManager: SynapseManager;
  private services: Services;
  private config: BrainConfig;
  private eventBus: TypedEventBus;

  async start(): Promise<void> {
    // 1. Config laden (Datei + Env-Overrides)
    this.config = loadConfig();

    // 2. Logger initialisieren
    initLogger(this.config.log);

    // 3. DB initialisieren + Migrationen
    this.db = createConnection(this.config.dbPath);
    runMigrations(this.db);

    // 4. EventBus
    this.eventBus = new TypedEventBus();

    // 5. Synapse Manager (muss vor Services stehen, die ihn nutzen)
    this.synapseManager = new SynapseManager(
      new SynapseRepository(this.db),
      this.config.synapses
    );

    // 6. Services initialisieren (inkl. SynapseService und ResearchService)
    this.services = createServices(this.db, this.eventBus, this.synapseManager);

    // 7. Learning Engine starten (alle 15 Minuten)
    this.learningEngine = new LearningEngine(this.services, this.synapseManager, this.config.learning);
    this.learningEngine.startSchedule(this.config.learning.intervalMs);

    // 8. Research Engine starten (alle 60 Minuten, erster Cycle nach 5 min)
    this.researchEngine = new ResearchEngine(this.services, this.synapseManager, this.config.research);
    this.researchEngine.startSchedule(this.config.research.intervalMs);

    // 9. IPC Server starten
    const router = new IpcRouter(this.services);
    this.ipcServer = new IpcServer(router, this.config.ipc);
    this.ipcServer.start();

    // 10. Terminal-Cleanup-Timer (stale nach 5 Minuten)
    setInterval(
      () => this.services.terminal.cleanupStale(this.config.terminal.staleTimeoutMs),
      this.config.terminal.cleanupIntervalMs
    );

    // 11. PID-File schreiben
    writePidFile(process.pid);

    // 12. Event-Listeners (Synapsen werden hier verdrahtet)
    this.setupEventListeners();

    // 13. Graceful Shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    logger.info(`Brain daemon started (PID: ${process.pid})`);
  }

  async stop(): Promise<void> {
    logger.info('Shutting down...');
    this.researchEngine.stop();
    this.learningEngine.stop();
    this.ipcServer.stop();
    this.db.close();
    removePidFile();
    logger.info('Brain daemon stopped');
    process.exit(0);
  }

  private setupEventListeners(): void {
    // === Error Events + Synapsen ===

    this.eventBus.on('error:reported', async ({ errorId, terminalId, projectId }) => {
      // Synapse: Error → Projekt
      this.synapseManager.strengthen(
        { type: 'error', id: errorId },
        { type: 'project', id: projectId },
        'co_occurs'
      );

      // Sofort nach Matches suchen
      const matches = await this.services.error.matchSimilar(errorId);
      if (matches.length > 0) {
        const bestMatch = matches[0];

        // Synapse: Error → ähnlicher Error
        this.synapseManager.strengthen(
          { type: 'error', id: errorId },
          { type: 'error', id: bestMatch.candidate.id },
          'similar_to'
        );

        const solutions = await this.services.solution.getForError(bestMatch.candidate.id);
        if (solutions.length > 0) {
          this.services.notification.create({
            target_terminal_id: terminalId,
            notification_type: 'solution_available',
            reference_type: 'solution',
            reference_id: solutions[0].id,
            summary: `Known error: "${bestMatch.candidate.message.substring(0, 60)}..." - ${solutions.length} solution(s) available`,
          });
        }
      }
    });

    // === Solution Events + Synapsen ===

    this.eventBus.on('solution:applied', async ({ solutionId, errorId, outcome }) => {
      if (outcome === 'success') {
        // Starke Synapse: Solution löst Error
        this.synapseManager.strengthen(
          { type: 'solution', id: solutionId },
          { type: 'error', id: errorId },
          'solves',
          { outcome: 'success' }
        );
      } else if (outcome === 'failure') {
        // Synapse schwächen
        const synapse = this.synapseManager.find(
          { type: 'solution', id: solutionId },
          { type: 'error', id: errorId },
          'solves'
        );
        if (synapse) this.synapseManager.weaken(synapse.id, 0.7);
      }
    });

    // Cross-Projekt: Fehler gelöst → prüfe ob andere Projekte profitieren
    this.eventBus.on('solution:reported', async ({ solutionId, errorId }) => {
      const error = await this.services.error.getById(errorId);
      if (!error) return;

      const crossProjectErrors = await this.services.error.findCrossProject(
        error.fingerprint,
        error.project_id
      );

      for (const otherError of crossProjectErrors) {
        // Cross-Project Synapsen
        this.synapseManager.strengthen(
          { type: 'error', id: error.id },
          { type: 'error', id: otherError.id },
          'cross_project'
        );
        this.synapseManager.strengthen(
          { type: 'project', id: error.project_id! },
          { type: 'project', id: otherError.project_id! },
          'cross_project'
        );

        this.services.notification.create({
          notification_type: 'solution_available',
          reference_type: 'solution',
          reference_id: solutionId,
          summary: `Solution from project ${error.project_id} may fix error #${otherError.id}`,
        });
      }
    });

    // === Code Events + Synapsen ===

    this.eventBus.on('module:registered', async ({ moduleId, projectId }) => {
      this.synapseManager.strengthen(
        { type: 'code_module', id: moduleId },
        { type: 'project', id: projectId },
        'co_occurs'
      );
    });

    this.eventBus.on('module:reused', async ({ moduleId, projectId, outcome }) => {
      this.synapseManager.strengthen(
        { type: 'code_module', id: moduleId },
        { type: 'project', id: projectId },
        'uses_module',
        { outcome }
      );
    });

    // === Rule Events + Synapsen ===

    this.eventBus.on('rule:triggered', async ({ ruleId, errorId, outcome }) => {
      if (outcome === 'prevented') {
        this.synapseManager.strengthen(
          { type: 'rule', id: ruleId },
          { type: 'error', id: errorId },
          'prevents'
        );
      }
    });

    // === Error Chain Detection ===

    this.eventBus.on('error:chain_detected', async ({ causeErrorId, effectErrorId }) => {
      this.synapseManager.strengthen(
        { type: 'error', id: causeErrorId },
        { type: 'error', id: effectErrorId },
        'causes'
      );
    });

    // === Research Insights + Synapsen ===

    this.eventBus.on('insight:created', async ({ insightId, relatedNodeIds }) => {
      // Insight mit allen beteiligten Knoten verbinden
      for (const node of relatedNodeIds) {
        this.synapseManager.strengthen(
          { type: 'insight', id: insightId },
          { type: node.type, id: node.id },
          'derived_from'
        );
      }
    });
  }
}
```

## CLI Commands

```bash
brain start                     # Daemon starten (Hintergrund via detached child_process)
brain stop                      # Daemon stoppen (PID-File lesen, SIGTERM senden)
brain status                    # Status: Terminals, Errors, Code, Synapsen, Research
brain query "error message"     # Ähnliche Fehler + Lösungen suchen
brain modules [--language ts]   # Code-Module auflisten
brain insights [--type trend]   # Research Insights anzeigen
brain network [--node error:42] # Synapsen-Netzwerk um einen Knoten erkunden
brain export [--format json]    # Daten exportieren
brain reset [--confirm]         # Datenbank zurücksetzen
brain logs [--tail 50]          # Log-Datei anzeigen
```

### Beispiel: `brain status` Output
```
Brain Daemon: RUNNING (PID 12345, uptime 2h 34m)
Database: brain.db (2.4 MB)

Terminals (3 connected):
  T1: my-api       (PID 1234)  Active   5s ago
  T2: frontend     (PID 5678)  Active   12s ago
  T3: data-tools   (PID 9012)  Idle     45s ago

Error Brain:
  Errors: 42 total, 8 unresolved
  Solutions: 31 (avg confidence: 0.74)
  Rules: 8 active, 2 pending
  Anti-Patterns: 3

Code Brain:
  Modules: 23 registered
  Reuses: 14 total (9 exact, 3 adapted, 2 pattern-based)
  Top module: retry.ts (4 reuses, confidence 0.92)

Synapse Network:
  Nodes: 98  Synapses: 247
  Avg weight: 0.43  Strong (>0.7): 31
  Top connection: Solution#7 --solves--> Error#42 (weight: 0.96)

Research Brain:
  Insights: 12 active (3 high priority)
  Last cycle: 18m ago  Next: in 42m
  Latest: "Template-Kandidat: API-Client Pattern (3 Projekte)"

Learning:
  Last cycle: 5m ago (3 patterns, 1 new rule)
  Next cycle: in 10m
```

## Konfiguration

```typescript
interface BrainConfig {
  dbPath: string;                        // Default: ~/.brain/brain.db
  ipc: {
    pipeName: string;                    // Default: \\.\pipe\brain-ipc (Win) / /tmp/brain.sock (Unix)
    maxConnections: number;              // Default: 50
  };
  learning: {
    intervalMs: number;                  // Default: 900_000 (15 min)
    minOccurrences: number;              // Default: 3
    minSuccessRate: number;              // Default: 0.70
    minConfidence: number;               // Default: 0.60
    pruneThreshold: number;              // Default: 0.20
    maxRejectionRate: number;            // Default: 0.50
    decayHalfLifeDays: number;           // Default: 30
  };
  terminal: {
    heartbeatIntervalMs: number;         // Default: 30_000
    staleTimeoutMs: number;              // Default: 300_000 (5 min)
    cleanupIntervalMs: number;           // Default: 60_000
  };
  matching: {
    threshold: number;                   // Default: 0.70
    strongThreshold: number;             // Default: 0.90
    maxCandidates: number;               // Default: 100
  };
  code: {
    moduleThreshold: number;             // Default: 0.60 (Reusability Score minimum)
    similarityThreshold: number;         // Default: 0.70
    autoAnalyze: boolean;                // Default: true
    ignorePaths: string[];               // Default: ["node_modules", "dist", ".git", "__pycache__"]
  };
  synapses: {
    initialWeight: number;               // Default: 0.1
    learningRate: number;                // Default: 0.15 (wie schnell Synapsen stärker werden)
    decayHalfLifeDays: number;           // Default: 45 (Synapsen verblassen langsamer als Solutions)
    pruneThreshold: number;              // Default: 0.05 (unter diesem Gewicht → löschen)
    decayAfterDays: number;              // Default: 14 (Decay erst nach 14 Tagen Inaktivität)
    maxDepth: number;                    // Default: 3 (Spreading Activation Tiefe)
    minActivationWeight: number;         // Default: 0.2 (Minimum für Pfad-Traversierung)
  };
  research: {
    intervalMs: number;                  // Default: 3_600_000 (60 min)
    initialDelayMs: number;              // Default: 300_000 (5 min, Brain soll erstmal Daten sammeln)
    minDataPoints: number;               // Default: 10 (Minimum Errors/Solutions bevor geforscht wird)
    trendWindowDays: number;             // Default: 7
    gapMinOccurrences: number;           // Default: 5 (Fehler muss 5x auftreten für Gap-Erkennung)
    synergyMinWeight: number;            // Default: 0.5 (Minimum Synapse-Gewicht für Synergie)
    templateMinAdaptations: number;      // Default: 3 (Minimum Adaptationen für Template-Vorschlag)
    insightExpiryDays: number;           // Default: 30 (Insights verfallen nach 30 Tagen)
  };
  log: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string;                        // Default: ~/.brain/brain.log
    maxSizeMb: number;                   // Default: 10
    maxFiles: number;                    // Default: 3 (Rotation)
  };
  retention: {
    maxErrorAgeDays: number;             // Default: 90
    maxResolvedErrorAgeDays: number;     // Default: 180
    maxLogAgeDays: number;               // Default: 30
    cleanupIntervalMs: number;           // Default: 86_400_000 (24h)
  };
}
```

## Implementierungsreihenfolge (8 Phasen)

### Phase 1: Foundation
**Ziel:** Projekt-Skeleton, DB, Config - alles was andere Phasen brauchen.

- `package.json` mit allen Dependencies
- `tsconfig.json` (strict, ES2022, NodeNext module resolution)
- `.gitignore` (node_modules, data/, dist/, *.db, *.log)
- `src/config.ts` - Konfiguration mit Defaults + Env-Overrides
- `src/types/` - Alle TypeScript Interfaces (inkl. synapse.types.ts, research.types.ts)
- `src/utils/logger.ts` - Winston File-Logger mit Rotation
- `src/utils/hash.ts` - SHA-256 Wrapper
- `src/utils/paths.ts` - Pfad-Normalisierung (Windows/Unix)
- `src/utils/events.ts` - Typisierter EventBus
- `src/db/connection.ts` - SQLite Connection (WAL, journal_mode, synchronous, cache_size Pragmas)
- `src/db/migrations/` - Alle 5 Migrations + Runner
- `src/db/repositories/` - Alle 10 Repository-Klassen (jede mit eigenen Prepared Statements)

### Phase 2: Parsing, Matching & Code Analysis
**Ziel:** Die "Intelligenz" - Error-Erkennung, Matching, Code-Analyse.

- `src/parsing/types.ts` - Parser Interfaces
- `src/parsing/error-parser.ts` - Registry-basierter Dispatcher
- `src/parsing/parsers/` - Node, Python, Rust, Go, Shell, Compiler, Generic
- `src/matching/tokenizer.ts` - Text-Tokenisierung (splitCamelCase, splitSnakeCase, stopwords)
- `src/matching/similarity.ts` - Levenshtein, Cosine, Jaccard
- `src/matching/tfidf.ts` - Inkrementeller TF-IDF Index mit Persistenz
- `src/matching/fingerprint.ts` - Error-Fingerprinting mit Templatisierung
- `src/matching/error-matcher.ts` - Multi-Signal Matching Engine
- `src/code/analyzer.ts` - Export-Extraction, Purity-Check, Cohesion-Messung
- `src/code/fingerprint.ts` - Strukturelles Code-Hashing
- `src/code/matcher.ts` - Code-Similarity-Matching
- `src/code/registry.ts` - Module-Registration + Granularity-Detection
- `src/code/scorer.ts` - Reusability-Scoring (6 Signals)
- `src/code/parsers/` - TypeScript, Python, Generic Code-Parser

### Phase 3: Synapsen-Netzwerk
**Ziel:** Das neuronale Netzwerk das alles verbindet.

- `src/synapses/synapse-manager.ts` - Erstellen, Stärken, Schwächen von Synapsen
- `src/synapses/hebbian.ts` - Hebbsches Lerngesetz (logarithmische Verstärkung, Sättigung)
- `src/synapses/pathfinder.ts` - BFS-Pfadsuche mit Gewichts-Tracking
- `src/synapses/activation.ts` - Spreading Activation (Multi-Hop Netzwerk-Traversierung)
- `src/synapses/decay.ts` - Synaptische Abschwächung + Pruning inaktiver Verbindungen

### Phase 4: Services
**Ziel:** Business-Logik über den Repositories.

- `src/services/error.service.ts` - Report, Query, Match, Auto-Label
- `src/services/solution.service.ts` - Report, Rate, Track Attempts
- `src/services/terminal.service.ts` - Register, Heartbeat, Cleanup
- `src/services/prevention.service.ts` - Rule-Check, Antipattern-Check
- `src/services/code.service.ts` - Analyze, Find, Similarity, Register
- `src/services/synapse.service.ts` - Context-Queries, Pfadsuche, Netzwerk-Stats
- `src/services/research.service.ts` - Insights abfragen, Suggestions generieren
- `src/services/notification.service.ts` - Create, List, Acknowledge
- `src/services/analytics.service.ts` - Summary, Trends, Network Overview

### Phase 5: Learning Engine + Research Brain
**Ziel:** Das System wird über Zeit besser UND forscht eigenständig.

- `src/learning/confidence-scorer.ts` - Wilson Score + Time Decay
- `src/learning/decay.ts` - Zeitbasierte Relevanz-Berechnung
- `src/learning/pattern-extractor.ts` - Centroid-basiertes Error-Clustering
- `src/learning/rule-generator.ts` - Regeln aus Mustern generieren
- `src/learning/learning-engine.ts` - Lern-Zyklus + Scheduling
- `src/research/research-engine.ts` - Forschungs-Zyklus Orchestrierung (7 Phasen)
- `src/research/trend-analyzer.ts` - Error-Frequenz, Solution-Erfolgsrate über Zeit
- `src/research/gap-analyzer.ts` - Ungelöste recurring Errors, isolierte Knoten
- `src/research/synergy-detector.ts` - Module-Paare, transferierbare Solutions, Workflow-Patterns
- `src/research/template-extractor.ts` - Adaptierte Module → parametrisierte Templates
- `src/research/insight-generator.ts` - Projekt-Vorschläge, Tool-Ideen, Optimierungen

### Phase 6: IPC + MCP
**Ziel:** Kommunikation - Daemon erreichbar für Terminals und Claude.

- `src/ipc/protocol.ts` - Length-prefixed JSON Framing (Encode/Decode)
- `src/ipc/router.ts` - Method-Routing mit Error-Handling
- `src/ipc/server.ts` - Named Pipe Server
- `src/ipc/client.ts` - IPC Client (für MCP Server → Daemon)
- `src/mcp/server.ts` - MCP Server (stdio Transport, Tool Registration)
- `src/mcp/tools.ts` - Alle 13 MCP Tool-Definitionen
- `src/mcp/auto-detect.ts` - Error-Pattern-Erkennung für Hooks

### Phase 7: BrainCore + CLI + Hooks
**Ziel:** Alles zusammenbinden, benutzbar machen.

- `src/brain.ts` - BrainCore (Start, Stop, Service-Wiring, Synapse-Events, Engine-Scheduling)
- `src/index.ts` - Commander CLI Setup
- `src/cli/commands/start.ts` - Daemon als detached child_process starten
- `src/cli/commands/stop.ts` - PID lesen, SIGTERM senden
- `src/cli/commands/status.ts` - Text-basierter Status (inkl. Synapse-Stats + Research-Insights)
- `src/cli/commands/query.ts` - Error-Suche via CLI
- `src/cli/commands/modules.ts` - Code-Module auflisten
- `src/cli/commands/insights.ts` - Research Insights anzeigen
- `src/cli/commands/network.ts` - Synapsen-Netzwerk erkunden
- `src/cli/commands/export.ts` - JSON/CSV Export
- `src/hooks/post-tool-use.ts` - Auto Error Detection Hook
- `src/hooks/post-write.ts` - Auto Code Analysis Hook

### Phase 8: Tests
**Ziel:** Alles getestet, produktionsreif.

- Unit-Tests:
  - `tests/unit/matching/` - Fingerprinting, Similarity, TF-IDF, Error-Matcher
  - `tests/unit/parsing/` - Jeder Parser einzeln mit Fixtures
  - `tests/unit/code/` - Analyzer, Fingerprint, Scorer, Granularity
  - `tests/unit/learning/` - Wilson Score, Decay, Pattern-Extraktion, Rule-Gen
  - `tests/unit/synapses/` - Hebbian Learning, Spreading Activation, Decay, Pathfinding
  - `tests/unit/research/` - Trend-Analyse, Gap-Analyse, Synergie-Detektion, Template-Extraktion
- Integration-Tests:
  - `tests/integration/error-flow.test.ts` - Error → Parse → Store → Match → Solution → Synapse
  - `tests/integration/code-flow.test.ts` - Write → Analyze → Register → Find → Reuse → Synapse
  - `tests/integration/synapse-flow.test.ts` - Events → Synapsen bilden → Spreading Activation → Kontext
  - `tests/integration/research-cycle.test.ts` - Daten sammeln → Forschen → Insights → Notifications
  - `tests/integration/learning-cycle.test.ts` - Voller Lern-Zyklus inkl. Synapse-Decay
  - `tests/integration/ipc-flow.test.ts` - MCP → IPC → Daemon → Response
- Fixtures:
  - `tests/fixtures/errors/` - Beispiel-Errors pro Sprache (node, python, rust, go, shell)
  - `tests/fixtures/solutions/` - Beispiel-Lösungen
  - `tests/fixtures/code-modules/` - Beispiel-Code für Matching-Tests
  - `tests/fixtures/synapses/` - Vorkonfigurierte Netzwerke für Pfadsuche-Tests

## Verifikation

1. `npm run build` - TypeScript kompiliert ohne Fehler
2. `npm test` - Alle Tests grün
3. `brain start` - Daemon startet, PID-File wird geschrieben
4. `brain status` - Zeigt laufenden Brain mit 0 Terminals, leeres Netzwerk
5. **Error-Flow:** Error melden → Brain matcht → Lösung vorschlagen → Feedback → Confidence steigt → Synapse stärkt sich
6. **Code-Flow:** Code schreiben → Brain analysiert → Modul registriert → In anderem Projekt vorgeschlagen → Synapse zu Projekt
7. **Hook-Flow:** Bash-Fehler → Hook erkennt → Brain speichert → Nächstes Mal: Warnung
8. **Cross-Projekt:** Fehler in Projekt A lösen → Synapse cross_project → Brain schlägt Lösung für Projekt B vor
9. **Synapse-Flow:** Mehrere Aktionen → Synapsen bilden sich → Spreading Activation findet Zusammenhänge → Context-Query zeigt vernetztes Wissen
10. **Research-Flow:** Nach genug Daten → Research Engine läuft → Trends, Gaps, Synergien erkannt → Insights mit konkreten Vorschlägen
11. **Learning + Decay:** Synapsen die nicht bestätigt werden verblassen → Schwache Regeln werden gepruned → Netzwerk bleibt relevant

## Wichtige Entscheidungen

- **better-sqlite3 statt async**: Synchron ist für diesen Use-Case besser (kein Web-Server, lokaler Daemon). WAL-Modus erlaubt concurrent reads von mehreren MCP Server Prozessen.
- **Named Pipes + MCP Dual-Layer**: Named Pipes für performante Daemon-Kommunikation, MCP für saubere Claude-Integration. MCP Server sind Thin Clients, keine eigene Logik.
- **Hooks für automatische Erkennung**: PostToolUse-Hooks sind der unsichtbare Kanal. Der User muss nichts manuell melden, Brain läuft im Hintergrund. Hooks dürfen NIE den Workflow blockieren (silent catch).
- **Wilson Score statt Durchschnitt**: Bei wenigen Datenpunkten (1/0 = 100%) unrealistisch. Wilson Score berücksichtigt Stichprobengröße.
- **Centroid-basiertes Clustering statt Single-Pass**: Ordnungsunabhängig, findet Cluster besser, Running Average für effiziente Updates.
- **Parser-Registry statt Hardcoded Dispatch**: Neue Sprachen = neue Datei registrieren. Open/Closed Principle.
- **Labels statt Tag-Tabellen**: Auto-generierte JSON-Labels direkt am Record. Kein 3-Tabellen-Overhead für Tags die niemand manuell pflegt.
- **Notifications statt Inter-Terminal-Chat**: Ein User, ein Bildschirm. Brain informiert, es chattet nicht.
- **Synapsen-Netzwerk statt isolierter Relationen**: Statt `related_errors`, `cross_project_solutions` als separate Tabellen ein einheitliches Synapse-System das ALLES verbindet. Typed + weighted + decaying. Ermöglicht Spreading Activation und Multi-Hop-Entdeckungen die mit isolierten Tabellen unmöglich wären.
- **Hebbsches Lernen für Synapsen**: "Neurons that fire together, wire together". Wenn Solution X Error Y löst, wird die Synapse stärker. Bei Fehlschlag schwächer. Logarithmische Sättigung verhindert Übergewichtung. Natürlicher als binäre Relationen.
- **Research Brain als eigener Engine**: Getrennt von der Learning Engine (die taktisch lernt) forscht das Research Brain strategisch. Längere Intervalle (60 min vs 15 min), höhere Abstraktion (Trends, Synergien, Templates statt Error-Patterns). Generiert Insights die über einzelne Fehler/Lösungen hinausgehen.
- **Synapse-Decay statt Deletion**: Unbenutzte Verbindungen verblassen langsam (halfLife 45 Tage) statt hart gelöscht zu werden. Ermöglicht "Wiederentdeckung" wenn ein Pfad nach langer Zeit wieder relevant wird. Erst unter pruneThreshold (0.05) wird tatsächlich gelöscht.
- **Insights als first-class Citizens**: Nicht nur Notifications, sondern persistente, priorisierte, aktionierbare Erkenntnisse mit Lifecycle (active → acknowledged → acted_upon → expired). Das Research Brain wird über Zeit klüger weil es auf Insight-Outcomes lernen kann.
- **Kein ink Dashboard**: Claude IST das Dashboard. MCP-Tools liefern reichhaltige, formatierte Informationen. CLI gibt simplen Text-Status. Die UI-Komplexität von ink lohnt nicht für einen Daemon der primär durch Claude bedient wird.
- **Prepared Statements pro Repository**: Jedes Repository compiled seine eigenen Statements bei Init. Kein God-File mit 50+ Statements.
- **File-Logging statt DB-Event-Log**: Audit/Debug-Daten gehören in Log-Dateien mit Rotation, nicht in die Datenbank. Die DB bleibt für strukturierte, abfragbare Daten.
- **300s statt 90s stale Timeout**: Claude denkt manchmal minutenlang. 90s ist zu aggressiv.
- **Code-Fingerprinting normalisiert Identifier**: Lokale Variablennamen werden ersetzt, aber Import-Names und API-Calls bleiben. So matcht `const result = await fetch(url)` mit `const response = await fetch(endpoint)`.
