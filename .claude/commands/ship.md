Run the full forensic integration-tool pipeline for: $ARGUMENTS

Before starting: if .pipeline/ contains files from a previous run, move them to .pipeline-archive/<timestamp>/ (do not delete them). Confirm docs/forensic-requirements.md exists; if not, stop and tell me.

Execute these stages in order. Do not skip ahead. After each stage, confirm the handoff files exist before starting the next.

1. Delegate to the planner subagent with the request above. Wait for .pipeline/integration-profile.md and .pipeline/spec.md.
2. If the spec has OPEN QUESTIONS (especially legal, authorization, or licensing questions), stop and show them to me. Otherwise delegate to the coder subagent. Wait for .pipeline/changes.md.
3. Delegate to the tester subagent. Wait for .pipeline/test-results.md. If any test failed, stop and show me the failures. If any tests are NOT RUN, list them and the environment they need.
4. Delegate to the reviewer subagent. Show me .pipeline/review.md.
5. Report the final verdict. Do not merge anything, tag a release, or run the tool on any real evidence. Leave the branch for human review and independent validation.
