---
name: youtube-to-agent
description: Turn a YouTube tutorial into a working Claude Code skill or agent. Watches the video with /watch, gets an independent second read from Gemini's native video understanding, reconciles the two into one build spec, then hands that spec to skill-creator. Use when the user pastes a YouTube tutorial link and says "build this", "turn this into a skill", or "make an agent out of this".
argument-hint: "<youtube-url> [what you want out of it]"
allowed-tools: Bash, Read, Write, Skill, AskUserQuestion
license: MIT
user-invocable: true
---

# youtube-to-agent

Two independent readers watch the same video. /watch gives you frames plus a
timestamped transcript inside your own context. Gemini reads the video natively
on Google's side and returns a written spec. They are wrong in different ways,
and the disagreement is the useful part.

## Step 1: Scope before spending anything

Ask what the user actually wants if they did not say. Check the duration first.
Anything over about 20 minutes gets scoped to a section unless they insist.

## Step 2: The Claude pass

Run /watch. Pick the detail mode on purpose: `transcript` for talking heads,
`efficient` for a first look at a long screen recording, `balanced` when you need
to read the screen, `--resolution 1024` for terminal and code work. Use --start
and --end whenever a section was named. Always pass --no-whisper: transcription
runs locally in this pipeline, never through a paid API.

Read every frame path. Then write the six section spec to notes/claude-pass.md
BEFORE looking at Gemini's answer, or you will anchor to it.

The six sections to write:

1. **What is being built** — the end result, in one sentence
2. **Stack and dependencies** — every tool, library, version and service mentioned
3. **Step by step build order** — the exact sequence shown in the tutorial
4. **Configuration and environment** — env vars, API keys, config files, ports
5. **Prerequisites the presenter assumed** — things mentioned in passing as "you'll want to have already done X"
6. **Gotchas and warnings** — anything the presenter flagged as easy to get wrong

## Step 3: The Gemini pass

    python3 scripts/gemini_review.py "<url>" --samples 2 --end <seconds> \
      --focus "<what the user asked for>" > notes/gemini-pass.md

Two samples on purpose. A claim in both samples is worth something. A claim in
one is the model guessing.

## Step 4: Reconcile into SPEC.md

Three labels on every line. CONFIRMED means both agree, build on it. SINGLE
SOURCE means one reader only, keep it and mark it. CONFLICT means go look at the
frames yourself and settle it, never average two guesses.

Throw away every timestamp, duration and count. Keep exact strings. Watch for the
archetype trap: a step that reads like documentation rather than like this video
probably came from training data.

Write the reconciled spec as SPEC.md with this structure:

```
# [Title]: Build Spec

## What is being built
[CONFIRMED/SINGLE SOURCE] ...

## Stack and dependencies
[label] each dependency ...

## Step by step build order
[label] each step ...

## Configuration and environment
[label] each config item ...

## Prerequisites
[label] each prerequisite ...

## Gotchas
[label] each warning ...

## OPEN QUESTIONS
- Things neither reader covered
- Things that conflicted and could not be settled from evidence
```

## Step 5: Build and verify

Hand SPEC.md to skill-creator. Say plainly that it came from a video and that
SINGLE SOURCE lines are unverified. Then run the new skill once on a real input
and fix what breaks. A skill built from a tutorial and never executed is a
summary of a video, not a tool.

## Failure modes

- No captions: /watch returns frames only. Gemini still hears the audio, so the
  spoken content is covered. Say so in the spec, and run faster-whisper locally
  if you need the transcript on disk.
- Gemini 429s on every model: free tier quota is spent. Run the Claude pass alone
  and mark the whole spec SINGLE SOURCE.
- The two readers disagree about almost everything: the window was too wide.
  Narrow to a section and rerun both.
