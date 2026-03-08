# Text Animation

Physics-driven text animations. Each piece uses a different simulation technique to bring text to life — scroll to interact.

## Artifacts

| # | Name | Technique |
|---|------|-----------|
| 01 | Text Crumble | Shake with neighbor coupling, then fall |
| 02 | The Weaver | Lines assemble from scattered characters |
| 03 | Crystallization | Orbital motion → crystal formation |
| 04 | Langevin Chaos | Thermal noise, per-word gravity wells |
| 05 | Neon Flicker | Gaussian probability window, word-level flicker |
| 06 | Psychedelic | SVG renderer with scroll transitions |
| 07 | Pixel Letters | Canvas pixel extraction, scatter/reveal |
| 08 | Text Morph | LCS-based pixel matching, Langevin interpolation |
| 09 | Thread | Letter drop with Verlet integration |
| 10 | Rest | Per-letter neon flicker swap (one letter changes) |
| 11 | Fear | Timeline-synced stanza transitions with curl noise |
| 13 | Cloud | Curl noise dissolution with beat sync |

## Running

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Structure

```
artifacts/     # Individual animation pieces
lib/           # Shared physics + rendering code
materials/     # Fonts
tools/         # SVG editor, animator, timeline recorder
```
