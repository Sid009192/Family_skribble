# Decision Log

## 2026-07-03 — Word difficulty levels
**Proposed:** Add a `difficulty` room setting (easy/medium/hard/mix) that filters which
default words can be drawn, classified by how hard the object is to draw/recognize
(not word length).
**Verdict:** Adopted
**Why:**
- Default word list splits into three curated files (`server/src/words/{easy,medium,hard}.ts`,
  ~100 words each), hand-tagged since drawability doesn't reduce to a formula.
- Pool is a sliding band, not a strict threshold: easy→easy only; medium→easy+medium;
  hard→medium+hard; mix→all three. Keeps the hard pool from being too small/repetitive.
- Custom words are always included regardless of difficulty (no tagging burden on hosts).
- Only the word actually drawn is "used" for the session (not all shown choices);
  used-word tracking resets on new game start and auto-recycles if a filtered pool runs dry.
- Default setting is `mix`, so existing/untouched rooms behave exactly as today.
