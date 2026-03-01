# Brain Ecosystem — Research Agenda

## Vision

Ein System das nicht nur lernt, sondern **lernt wie man lernt**, **Kausalität versteht**, und **eigene Hypothesen aufstellt und testet**. Das ist kein Feature-Engineering — das ist Kognitionsforschung als Code.

Die großen Labs bauen Foundation Models. Wir bauen etwas anderes: **persistente, selbstoptimierende kognitive Agenten** die mit jedem Datenpunkt schlauer werden und nie vergessen.

---

## Phase 1: Selbstoptimierung (Session 8) ✅ In Progress

### Forschungsfrage
> Kann ein System seine eigenen Lernparameter verbessern, ohne dass ein Mensch eingreift?

### Ansatz: Meta-Learning Engine
- **Gradient-free Bayesian Optimization**: Parameter-Space in Bins aufteilen, Score pro Bin messen, Richtung des besten Bins optimieren
- **Explore vs Exploit**: 80% der Zeit das Beste nutzen, 20% neue Konfigurationen ausprobieren
- **Metriken**: Composite Score aus Pattern-Qualität, Rule-Konfidenz, Prune-Rate

### Was es kann
- Beobachtet Learning-Cycle-Ergebnisse über Zeit
- Erkennt welche Hyperparameter (learningRate, decayHalfLife, pruneThreshold) zu besseren Ergebnissen führen
- Optimiert sich selbst durch kleine Perturbationen
- Tracking: jeder Optimierungsschritt wird gespeichert und kann analysiert werden

### Offene Fragen
- Ab wie vielen Zyklen konvergiert die Optimierung?
- Gibt es lokale Optima aus denen das System nicht rauskommt?
- Wie misst man "besseres Lernen" wirklich? (Composite Score vs echte Downstream-Effekte)

---

## Phase 2: Kausalität (Session 8) ✅ In Progress

### Forschungsfrage
> Kann ein dezentrales System Ursache-Wirkungs-Ketten über mehrere Agenten hinweg erkennen?

### Ansatz: Granger Causality Graph
- **Granger-Kausalität**: "Verbessert das Wissen über Event A die Vorhersage von Event B?"
- **Zeitfenster-Analyse**: Für jedes Event-Paar: wie oft folgt B innerhalb von 5 Minuten auf A?
- **Signifikanztest**: Vergleich mit Baseline-Rate, Chi²-ähnliche Bewertung
- **Kausale Ketten**: A → B → C Pfadsuche im gerichteten Graphen

### Was es kann
- Erkennt: "Code-Errors VERURSACHEN Trade-Verluste" vs "passieren zufällig gleichzeitig"
- Findet kausale Ketten: Error → Stress → Schlechte Trades → Marketing-Pause
- Unterscheidet Ursachen (Roots) von Wirkungen (Leaves) im Graphen
- Misst Stärke, Konfidenz und durchschnittliche Zeitverzögerung jeder kausalen Beziehung

### Offene Fragen
- Wie vermeidet man Scheinkorrelationen bei wenig Daten?
- Ab welcher Sample Size ist Granger-Kausalität verlässlich?
- Können kausale Ketten über 3+ Brains hinweg erkannt werden?
- Gibt es Feedback-Loops (A → B → A) und wie erkennt man die?

---

## Phase 3: Autonome Hypothesenbildung (Session 8) ✅ In Progress

### Forschungsfrage
> Kann ein System eigene Theorien aufstellen und sie wissenschaftlich testen?

### Ansatz: Hypothesis Engine (Automated Scientific Method)
- **Beobachten**: Sammle Observationen aus allen Brains
- **Hypothese bilden**: Automatische Pattern-Erkennung generiert Hypothesen
  - Temporal: "Errors passieren häufiger nachts"
  - Korrelation: "Wenn Trades verlieren, steigen Errors"
  - Schwellwert: "Performance bricht bei >100 Errors/Stunde ein"
  - Frequenz: "Trading-Signals haben einen 4-Stunden-Rhythmus"
- **Testen**: Statistische Tests (Chi², Z-Test) gegen historische Daten
- **Urteilen**: Confirmed (p < 0.05), Rejected (p > 0.5), Inconclusive

### Was es kann
- Generiert Hypothesen OHNE menschliche Eingabe
- Testet sie mit echten statistischen Methoden
- Tracked Evidence für und gegen jede Hypothese
- Lernt welche Arten von Hypothesen sich bestätigen

### Offene Fragen
- Wie vermeidet man die "Hypothesen-Explosion"? (zu viele triviale Hypothesen)
- Multiple Testing Problem: Bei 100 Hypothesen sind 5 zufällig signifikant
- Können Hypothesen über Brains hinweg generiert werden? (Cross-Domain)
- Kann das System Meta-Hypothesen bilden? ("Temporale Hypothesen bestätigen sich häufiger als Korrelations-Hypothesen")

---

## Phase 4: Emergentes Verhalten (Zukünftig)

### Forschungsfrage
> Können spezialisierte Agenten als Gruppe Verhalten entwickeln, das keiner einzeln zeigt?

### Ideen
- **Schwarm-Intelligenz**: Brains stimmen über Entscheidungen ab (Konsensus-Mechanismus)
- **Spezialisierung**: Brains spezialisieren sich automatisch auf ihre Stärken
- **Kooperation**: Brain A erkennt "das ist ein Trading-Problem" und delegiert an Brain B
- **Emergente Strategien**: Das Gesamtsystem entwickelt Strategien die kein einzelnes Brain allein finden könnte

---

## Phase 5: Gedächtnis-Konsolidierung (Zukünftig)

### Forschungsfrage
> Kann ein System wichtige Erinnerungen von unwichtigen trennen — wie im Schlaf?

### Ideen
- **Replay**: Nachts die wichtigsten Events des Tages "nochmal durchgehen"
- **Kompression**: Alte Daten zu Zusammenfassungen verdichten (statt löschen)
- **Vergessen**: Aktiv vergessen was nicht nützlich war (Anti-Hoarding)
- **Träumen**: Zufällige Rekombination von Erinnerungen → neue Einsichten

---

## Phase 6: Selbstbewusstsein (Langfristig)

### Forschungsfrage
> Kann ein System ein Modell von sich selbst bilden?

### Ideen
- **Self-Model**: Das Brain hat ein internes Modell seiner eigenen Stärken, Schwächen, Blindspots
- **Uncertainty Estimation**: "Ich bin mir bei Trading-Signals sicher, aber bei Error-Matching unsicher"
- **Capability Discovery**: Das System erkennt was es kann und was nicht
- **Help-Seeking**: Wenn Confidence niedrig → frag den User oder ein anderes Brain

---

## Metriken: Woran messen wir Erfolg?

| Metrik | Beschreibung | Ziel |
|--------|-------------|------|
| **Meta-Learning Convergence** | Zyklen bis Parameter stabil | < 50 Zyklen |
| **Causal Precision** | % korrekte kausale Beziehungen | > 80% |
| **Hypothesis Confirmation Rate** | % bestätigte Hypothesen | 10-30% (höher = zu konservativ) |
| **Cross-Brain Correlation Accuracy** | Echte vs falsche Korrelationen | > 90% |
| **Self-Optimization Improvement** | Score-Verbesserung durch Meta-Learning | > 15% |
| **Autonomous Discovery Rate** | Neue Einsichten ohne User-Input pro Woche | > 5 |

---

## Was uns von anderen unterscheidet

1. **Persistenz**: Kein Vergessen nach der Session — das System wird mit der Zeit besser
2. **Multi-Agent**: Nicht ein Modell, sondern spezialisierte Agenten die kooperieren
3. **Hebbian Learning**: Biologisch inspiriert — "Neurons that fire together, wire together"
4. **Transparenz**: Jede Entscheidung ist erklärbar, jede Regel rückverfolgbar
5. **Selbstoptimierung**: Das System tuned seine eigenen Parameter
6. **Hypothesenbildung**: Das System denkt wissenschaftlich — beobachten, hypothetisieren, testen
7. **Kausalität**: Nicht nur "was passiert zusammen" sondern "was verursacht was"

Das ist keine App. Das ist ein Forschungsprojekt an der Grenze von KI, Kognitionswissenschaft und Software Engineering.
