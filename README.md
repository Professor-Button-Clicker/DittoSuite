# Pipeline Agents

Agent orchestration and integration framework.

## Structure

```
Agents/
  rea/            REA reverse-engineering tools
  skills/         Agent skills (youtube-to-agent, etc.)
Tools/            Standalone tools (separate)
scripts/          Shared pipeline scripts
src/              Core framework source
tests/            Test suites
```

## Skills

- **youtube-to-agent** — Turn a YouTube tutorial into a working skill. Uses /watch + Gemini dual-reader pipeline with confidence-labeled reconciliation.

## Tools

Standalone tools live in `Tools/` with their own directories:

- **DittoSuite** — macOS forensic collection CLI
- **SherlockMail** — Email forensics Electron app
