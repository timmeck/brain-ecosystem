---
name: Masterplan 11.0 — Core Learning Kernel
description: 4 Sessions (137-140) — Klein, hart, messbar. Nur echte Engpässe lösen, sauber attribuierbar.
type: project
---

# Masterplan 11.0 — Core Learning Kernel

**Kern-Idee:** Brain's vier echte Engpässe lösen — nicht "gute Ideen importieren", sondern gemessene Schwächen fixen.

**Prinzipien (ChatGPT-Review):**
- **1 dominante Idee pro Session** — sauber attribuierbar
- **Jede Session beantwortet: welcher Report-Befund macht das nötig?**
- **Baseline Snapshot VOR Intervention** — persistent ablegen, dann erst Code ändern
- **Kein Feature ohne nachgewiesenen Engpass**
- **2-4 Tage Laufzeit nach Kern-Plan, dann erst weiter**
- **Kill Criterion pro Session** — wann ist die Intervention fehlgeschlagen?
- **Noisy Proxy Risk pro Session** — welche Metrik könnte täuschen?

---

## Session 137 — Learning Kernel: Bounded Hebbian

**Report-Befund:** Synapse-Gewichte können unbounded wachsen. Starke und schwache Signale verstärken gleich. Keine differenzierte Signal-Qualität.

**Nur 2 Änderungen:**

| Task | Details |
|------|---------|
| Multiplicative Hebbian | `w_new = min(1.0, w_old * (1+0.01)^n)` statt additiv. Self-bounding [0,1]. |
| Signal Quality Weighting | `sqrt(score_A * score_B)` — starke Co-Aktivierungen verstärken mehr als schwache |

**Bewusst NICHT in dieser Session:**
- ~~EWC++~~ → erst wenn catastrophic forgetting nachgewiesen
- ~~Bayesian Confidence~~ → erst wenn Confidence-Berechnung als Engpass identifiziert

**Phase 0 — Baseline Snapshot (VOR Code-Änderungen):**
1. Max Synapse-Gewicht über alle Brains messen + persistent loggen
2. Gewichtsverteilung (Histogram: 0-0.25, 0.25-0.5, 0.5-0.75, 0.75-1.0, >1.0) snapshot
3. Top-10 stärkste Synapsen mit IDs + Gewichten persistent speichern
4. Alle Snapshots in `baseline_137.json` ablegen

**Modularität:**
- **Owner:** brain-core/SynapseNetwork
- **Owned State:** `synapses` Tabelle (bestehend, keine neuen Spalten)
- **Read Contract:** Engines lesen über `SynapseNetwork.getWeight(a, b)`
- **Write Contract:** Nur SynapseNetwork schreibt. Engines melden über `recordCoActivation(a, b, score_a, score_b)`

**Baseline → Ziel (nach 2 Tagen):**
| Metrik | Baseline (Phase 0!) | Ziel |
|--------|---------------------|------|
| Max Synapse-Gewicht | snapshot | ≤ 1.0 (bounded) |
| Gewichtsverteilung | snapshot | gleichmäßiger, kein Bucket >1.0 |
| Top-10 Synapse Stabilität | snapshot | Top-10 ändern sich nicht > 20% pro Tag |

**Getrennte Wirkungsmessung (beide Hebel separat beobachtbar):**
- Tests für bounded update: Gewicht bleibt ≤ 1.0 auch nach 1000 Co-Aktivierungen
- Tests für quality weighting: Hohe score_a * score_b → stärkere Verstärkung als niedrige
- Metrik die durch beides beeinflusst sein könnte: Gewichtsverteilung insgesamt

**Kill Criterion:** Top-10 Synapse Stabilität kippt > 50% pro Tag → neue Lernregel zu volatil → Rollback.

**Noisy Proxy Risk:** Gewichtsverteilung "gleichmäßiger" heißt nicht automatisch "besser". Könnte auch bedeuten: alle Synapsen konvergieren gegen Mittelwert, Differenzierung geht verloren.

**Tests:** ~10 Tests (bounded weights, quality weighting, edge cases, baseline capture)

---

## Session 138 — Retrieval Kernel: RRF + Usage Tracking

**Report-Befund:** Retrieval nutzt aktuell nur einen Pfad (FTS oder Semantic). Keine Fusion. Kein Tracking welche Memories tatsächlich genutzt werden. Cold Memory Detection ist ad-hoc.

**Nur 2 Änderungen:**

| Task | Details |
|------|---------|
| Reciprocal Rank Fusion | `score(d) = sum(1/(k + rank(d, list_i)))` — fusioniert **FTS + Semantic** (zwei Listen, nicht drei). Kein "Temporal" als dritte Quelle — das wäre aktuell ein schwaches Pseudosignal ohne echte Ranking-Liste. |
| Retrieval Usage Metadata | `access_count`, `last_accessed_at` Spalten. Bei jedem Abruf inkrementieren. |

**Klarstellung "Temporal":** Temporal als dritte RRF-Quelle wird bewusst NICHT eingebaut. Es gibt aktuell keine eigenständige Temporal-Ranking-Liste. Recency/Temporal kann erst als dritte Quelle hinzukommen, wenn Usage-Daten (access_count) über Wochen gesammelt sind und daraus ein echtes Ranking gebaut werden kann.

**Bewusst NICHT in dieser Session:**
- ~~Temporal als dritte RRF-Quelle~~ → erst wenn echte Temporal-Ranking-Liste existiert
- ~~Bi-temporal Knowledge~~ → erst wenn historische Queries ein echter Treiber sind
- ~~Spaced Repetition~~ → erst wenn Usage-Daten 2+ Wochen gesammelt
- ~~ACT-R Scoring~~ → erst nach Usage-Baseline (ACT-R braucht access_count Daten)

**Phase 0 — Baseline Snapshot:**
1. Aktuelle Retrieval-Methode dokumentieren (welcher Pfad wird genutzt?)
2. 10 repräsentative Queries manuell testen: Top-10 Ergebnisse per FTS vs. Semantic
3. Snapshot in `baseline_138.json`

**Modularität:**
- **Owner:** brain-core/RetrievalMaintenanceEngine
- **Owned State:** Neue Spalten in `typed_memories`: `access_count INTEGER DEFAULT 0`, `last_accessed_at TEXT`
- **Read Contract:** RRF liest Scores aus FTS und Semantic über bestehende APIs
- **Write Contract:** Updated nur eigene Spalten bei Abruf
- **Migration:** 018_retrieval_usage_columns

**Baseline → Ziel (nach 2 Tagen):**
| Metrik | Baseline (Phase 0!) | Ziel |
|--------|---------------------|------|
| Retrieval nutzt # Signalquellen | 1 (single path) | 2 (FTS + Semantic via RRF) |
| Cold Memories identifiziert | ad-hoc | access_count = 0 nach 7d = cold |
| RRF-Top-10 vs Single-Signal-Top-10 | Phase 0 Stichprobe | RRF mindestens gleichwertig, idealerweise diverser |

**Kill Criterion:** RRF-Top-10 sind konsistent schlechter als Single-Signal-Top-10 bei manueller Stichprobe → RRF-Gewichtung falsch → k-Konstanten anpassen oder Rollback.

**Noisy Proxy Risk:** `access_count` misst Häufigkeit, nicht Wertigkeit. Häufig abgerufene Memories sind nicht automatisch die wertvollsten — es könnten auch die am prominentesten platzierten sein (Self-Reinforcing Loop).

**Tests:** ~12 Tests (RRF ranking, usage increment, cold detection, migration)

---

## Session 139 — Hypothesis Hardening (ChatGPT S134 Fixes)

**Report-Befund (ChatGPT S134):**
- 95.2% confirmation rate (zu hoch → Confirmation Bias)
- 72.5% Hypothesen stuck in "testing" (testing graveyard)
- Calibration offset +26.8% (overconfident)
- Nur 3 Strategies emerged (Ziel: viel mehr)
- Keine Anti-Patterns automatisch generiert

**4 Änderungen (alle direkt aus Report-Befunden):**

| Task | Details |
|------|---------|
| Resolution Policy | testing > 48h → forced eval, > 72h → auto-reject. Kein testing graveyard. |
| Domain-Calibration | `confidence = rolling_accuracy(domain)` statt globalem Offset. Neue Tabelle. |
| Anti-Pattern Auto-Gen | Bei Reject/Fehler → Anti-Pattern erzeugen über PrincipleEngine API |
| Strategy Emergence | 3× confirmed Hypothesis → auto Strategy-Kandidat |

**Bewusst NICHT in dieser Session:**
- ~~Hypothesis Lineage~~ → erst nach Emergence funktioniert
- ~~Triple Loop~~ → erst nach Resolution Policy greift
- ~~Creativity Calibration~~ → erst nach Bias reduziert

**Phase 0 — Baseline Snapshot:**
1. Aktuelle Confirmation Rate messen
2. Anzahl Hypothesen in "testing" > 48h zählen
3. Aktuelle Calibration Offset pro Domain messen
4. Aktuelle Strategy Count
5. Aktuelle Anti-Pattern Count (auto-generated vs. manual)
6. Snapshot in `baseline_139.json`

**Modularität:**
- **Owner:** brain-core/HypothesisEngine (Resolution, Emergence), brain-core/CalibrationService (neu, Domain-Calibration)
- **Owned State (Hypothesis):** Neue Spalten: `forced_eval_at TEXT`, `domain TEXT`
- **Owned State (Calibration):** Neue Tabelle `domain_calibration(domain TEXT PK, total INTEGER, correct INTEGER, rolling_accuracy REAL, updated_at TEXT)`
- **Read Contract:** HypothesisEngine liest Calibration über `CalibrationService.getAccuracy(domain)`
- **Write Contract:** HypothesisEngine updated eigene Spalten + erzeugt Anti-Patterns über PrincipleEngine API (nicht direkt DB). CalibrationService updated nur domain_calibration.

**Baseline → Ziel (nach 3 Tagen) — PRO HEBEL SEPARAT:**

| Hebel | Metrik | Baseline (S134) | Ziel |
|-------|--------|-----------------|------|
| Resolution Policy | Testing > 48h count | 72.5% | < 40% |
| Resolution Policy | Auto-rejected > 72h | 0 | > 0 |
| Domain-Calibration | Calibration Offset | +26.8% | < 15% |
| Domain-Calibration | Per-Domain Accuracy tracked | nein | ja |
| Anti-Pattern Auto-Gen | Auto-generated Anti-Patterns | ~0 | proportional zu Rejects |
| Strategy Emergence | Strategies from confirmed hypotheses | 3 | > 10 |
| (Gesamtwirkung) | Confirmation Rate | 95.2% | 60-80% |

**Kill Criterion:**
- Confirmation Rate sinkt, aber Strategy Emergence bleibt 0 und Rejects explodieren → Resolution Policy zu aggressiv → Timeouts lockern
- Calibration sinkt nicht unter 20% nach 3 Tagen → Domain-Calibration unzureichend → Rolling Window anpassen

**Noisy Proxy Risk:**
- Anti-Pattern Count kann künstlich steigen ohne echte Qualität (jeder Reject generiert ein Anti-Pattern, aber sind sie nützlich?)
- Strategy Emergence Count sagt nichts über Strategy-Qualität — 10 schlechte Strategies sind nicht besser als 3 gute

**Tests:** ~15 Tests (Resolution policy, Domain calibration, Auto-gen, Emergence trigger)

---

## Session 140 — MetaLearning Kernel (Observation Only)

**Report-Befund (ChatGPT S134):** Brain hat Reflexionsartefakte aber kein Self-Model. Explorer/Exploiter Ratio ~70/30 statt 50/50. Keine Meta-Principles über eigenes Verhalten. Brain optimiert Domäne, nicht sich selbst.

**3 Änderungen (NUR BEOBACHTUNG, KEINE STEUERUNG):**

| Task | Details |
|------|---------|
| Domain Accuracy Tracking | MetaLearningEngine beobachtet: prediction accuracy per domain, hypothesis success per generator |
| Explorer/Exploiter Ratio | **Nur Tracking + Dashboard-Metrik.** Keine automatische Steuerung. |
| Meta-Principles | Nur aus klaren Metriken: "Meine Scanner-Predictions sind X% overconfident in Domain Y" |

**Explizit: Keine automatische Steuerung in dieser Session.**
- Kein automatisches Rebalancing von Explorer/Exploiter
- Keine automatische Hypothesis-Allocation
- Keine automatische Parameter-Änderung
- MetaLearning BEOBACHTET nur. Empfehlungen werden als Dashboard-Hinweise angezeigt, nicht operativ umgesetzt.
- Automatische Steuerung kommt frühestens nach 2+ Wochen Beobachtungsdaten, in separater Session, hinter Feature Flag (default OFF).

**Bewusst NICHT in dieser Session:**
- ~~Empfehlungsautomatik~~ → erst nach Manual Review der ersten Meta-Principles
- ~~Cycle Pattern Analysis~~ → erst nach 2+ Wochen Daten
- ~~Aktive Steuerung~~ → erst nach Beobachtungsphase, hinter Feature Flag

**Phase 0 — Baseline Snapshot:**
1. Explorer/Exploiter Ratio schätzen (Anteil explorative vs. exploitative Hypothesen)
2. Prediction Accuracy per Domain (wenn messbar)
3. Strategy Emergence Rate
4. Snapshot in `baseline_140.json`

**Modularität:**
- **Owner:** brain-core/MetaLearningEngine (neu)
- **Owned State:** `meta_observations(id, engine TEXT, domain TEXT, metric TEXT, value REAL, observed_at TEXT)`, `meta_principles(id, content TEXT, confidence REAL, evidence JSON, created_at TEXT)`
- **Read Contract:** Liest Engine-Metriken über ResearchOrchestrator.getCycleMetrics() und HypothesisEngine.getOutcomes(). **Nur offizielle APIs, keine direkten DB-Queries auf fremde Tabellen.**
- **Write Contract:** Schreibt nur eigene Tabellen. Kann Dashboard-Hinweise als IPC-Events senden. **Darf KEINE Parameter direkt ändern.**

**Baseline → Ziel (nach 3 Tagen):**
| Metrik | Baseline (Phase 0!) | Ziel |
|--------|---------------------|------|
| Explorer/Exploiter Ratio | ~70/30 (geschätzt) | Tracking aktiv, Trend sichtbar |
| Domain Accuracy tracked | nein | ja, für alle aktiven Domains |
| Meta-Principles | 0 | ≥ 3 evidenzbasierte |
| Calibration Error per Domain | unknown | tracked + sichtbar im Dashboard |

**Kill Criterion:** MetaLearning produziert nach 3 Tagen nur triviale oder tautologische Principles → Observation-Pipeline nicht aussagekräftig → überarbeiten bevor Steuerung erwogen wird.

**Noisy Proxy Risk:**
- Meta-Principles Count ist keine gute Zielgröße — 3 triviale Principles ("Brain macht Dinge") sind wertlos
- Explorer/Exploiter Ratio ist schwer exakt zu messen — Definition von "explorativ" vs. "exploitativ" muss scharf sein

**Tests:** ~12 Tests (Observation recording, Principle generation from metrics, Explorer/Exploiter tracking, Read-only access pattern, no-write-to-foreign-tables)

---

## Nach 11.0: Laufen lassen + Messen (2-4 Tage)

**Kritische Fragen nach der Laufzeit:**
1. Sind Synapse-Gewichte jetzt bounded? Stabilität verbessert?
2. Ist RRF-Retrieval relevanter als Single-Signal?
3. Sinkt Confirmation Rate? Steigt Strategy Emergence? (Pro Hebel!)
4. Produziert MetaLearning echte Insights oder Noise?

**Gesamtindikator — "Did Brain get denser or just busier?"**

| Signal Density Metrik | Vorher | Nachher | Urteil |
|----------------------|--------|---------|--------|
| Strategy Emergence Rate | ~0.8% | ? | steigt = dichter |
| Knowledge Signal Ratio | ~4-5% | ? | steigt = dichter |
| Testing Graveyard | 72.5% | ? | sinkt = dichter |
| Calibration Drift | +26.8% | ? | sinkt = dichter |

**Erst wenn diese Fragen beantwortet sind → weiter mit 11.1+**

---

## Masterplan 11.1 — Platform Track (nach 11.0 Evaluation)

| Session | Fokus | Vorbedingung |
|---------|-------|-------------|
| 141 | Progressive Disclosure MCP (638→6 Tools) | 11.0 stabil |
| 142 | Security Hardening (agent-scan + promptfoo + Grounding) | 11.0 stabil |

## Masterplan 11.2 — Domain Expansion (nach 11.1)

| Session | Fokus | Vorbedingung |
|---------|-------|-------------|
| 143 | Trading Signals (trading-signals npm + augurs JS) | Calibration < 15% |
| 144 | PAS in Retrieval (Predictive Activation, domain-aware) | Usage-Daten ≥ 2 Wochen |

## Masterplan 11.3 — Advanced Research (nach 11.2 + Daten)

| Session | Fokus | Vorbedingung |
|---------|-------|-------------|
| 145 | EWC++ (nur wenn Forgetting nachgewiesen) | Synapse-Daten ≥ 4 Wochen |
| 146 | ACT-R Scoring (braucht access_count Daten) | Usage-Daten ≥ 4 Wochen |
| 147 | Bi-temporal Knowledge (nur wenn historische Queries gebraucht) | Konkrete Use Cases |
| 148 | Hypothesis Lineage + Triple Loop | Emergence Rate > 5% |
| 149 | Causal Refutation + Uplift | Causal Graph ausreichend groß |

## Masterplan 11.4 — Risk Track (separat, eigene Evaluation)

| Session | Fokus | Vorbedingung |
|---------|-------|-------------|
| 150+ | Alpaca + Real Broker | Calibration stabil, Risk Guards getestet, Brain lernt echte Regeln |

---

## Was bewusst rausgeflogen ist (und warum)

| Idee | Warum raus |
|------|-----------|
| Neuro-Symbolic (Session 146 alt) | Kein nachgewiesener Engpass. Epistemischer Luxus. |
| Bayesian Confidence | Erst wenn aktuelle Confidence als Problem nachgewiesen |
| Spaced Repetition | Braucht Usage-Daten die erst Session 138 sammelt |
| HyperAgent | Optional, nicht Core |
| Creativity Calibration | Erst nach Bias-Reduktion |
| Hopfield Network | Kein Engpass |
| Dosidicus Neurogenesis | Kein Engpass |
| HelixDB/zvec | Zu großes Migrations-Risiko |
| Temporal als 3. RRF-Quelle | Keine echte Ranking-Liste vorhanden, wäre Pseudosignal |
| Automatische MetaLearning-Steuerung | Erst nach Beobachtungsphase, Feature Flag |

---

## Quelle

Basierend auf:
- RepoSignal-Scan: 40 Keywords, ~200 Repos, 7 Deep-Research Reports → [reposignal-findings.md](reposignal-findings.md)
- ChatGPT Session 134 Review: Metriken-Analyse + Priority Fixes
- ChatGPT Masterplan-Review v1: "Zu breit, zu dicht, zu verliebt in importierte Klugheit"
- ChatGPT Masterplan-Review v2: "Approve with 4 conditions" (Baseline capture, Temporal klären, Pro-Hebel messen, Observation-only)
