# Reconciliation Prompt

Use this prompt after you have both `notes/claude-pass.md` and `notes/gemini-pass.md`.
Fill in the bracketed parts.

---

Read notes/claude-pass.md (the Claude /watch analysis) and notes/gemini-pass.md
(the Gemini native video analysis). These are two independent reads of the same
YouTube tutorial. They saw different things and they are wrong in different ways.

Produce one reconciled build specification as SPEC.md. For every claim, apply one
of three labels:

- **CONFIRMED** — both readers agree. Build on it.
- **SINGLE SOURCE** — only one reader reported this. Keep it, mark it, and the
  implementation should fail loudly rather than assume it is correct.
- **CONFLICT** — the two readers disagree. Quote both versions. Do not average
  them or pick a winner — flag it for me to check against the actual video.

Rules:
- Throw away every timestamp, duration, and count from both passes. Vision models
  reconstruct these, they do not read them.
- Keep exact strings: tool names, commands, file names, error messages. These are
  evidence.
- Watch for the archetype trap: if a line reads smoother and more complete than
  the surrounding lines, it probably came from training data rather than from the
  video. Label it SINGLE SOURCE even if both readers said it, and note the
  suspicion.

End the spec with an OPEN QUESTIONS section listing:
- Things neither reader mentioned but you would need to know to build this
- Things that conflicted and could not be settled without watching the video
- Assumptions that are reasonable but were never shown on screen

My goal is: [what you want at the end of the build]
