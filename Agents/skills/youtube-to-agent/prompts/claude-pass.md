# Claude Pass Prompt

Use this prompt after running `/watch` on a tutorial video. Fill in the bracketed parts.

---

You just watched a YouTube tutorial. Before I show you any other analysis, write
a structured build specification from what you saw. Use these six sections:

1. **What is being built** — the end result, in one sentence.

2. **Stack and dependencies** — every tool, library, version, and service
   mentioned or visible on screen. Be exact with version numbers and package
   names when you saw them.

3. **Step by step build order** — the exact sequence of actions the presenter
   demonstrated. Use their actual commands, file names, and words. Do not
   paraphrase terminal commands.

4. **Configuration and environment** — env vars, API keys, config files, ports,
   and settings shown or mentioned.

5. **Prerequisites the presenter assumed** — things mentioned in passing as
   "you'll need to have already done X" or things that were visible in their
   environment but never set up on camera. These asides are worth more than the
   rest of the runtime.

6. **Gotchas and warnings** — anything the presenter flagged as easy to get
   wrong, common mistakes they warned about, or "make sure you do X before Y".

My goal is: [what you want to build / what you want out of this tutorial]
I am building this into: [your project / codebase / system]

Save the result to notes/claude-pass.md. Do NOT look at any Gemini analysis
before writing this — the independence is the whole value.
