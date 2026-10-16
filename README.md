# Pipeline Agents

Agent orchestration and integration framework.

## Structure

```
Agents/         Agent implementations (includes REA reverse-engineering tools)
Tools/          Standalone tools (separate — see Tools/README.md)
src/            Core framework source
tests/          Test suites
```

## Tools

Standalone tools have been moved to `Tools/` with their own directories:

- **DittoSuite** — macOS forensic collection CLI
- **SherlockMail** — Email forensics Electron app
