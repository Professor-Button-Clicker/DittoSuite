#!/usr/bin/env python3
"""Gemini video review — sends a YouTube URL directly to Gemini for analysis.

Google fetches the video server-side; nothing downloads locally. Two samples
are taken by default because the model is a stochastic witness: a claim in
both samples is evidence, a claim in only one is the model guessing.

Usage:
    python3 scripts/gemini_review.py "<youtube-url>" \
        --samples 2 --end 600 \
        --focus "the whole build" \
        > notes/gemini-pass.md

Requires: GEMINI_API_KEY env var (free tier at aistudio.google.com/apikey).
Install: pip install google-genai
"""

import argparse
import os
import sys
import time

try:
    from google import genai
    from google.genai import types
except ImportError:
    print(
        "ERROR: google-genai not installed. Run: pip install google-genai",
        file=sys.stderr,
    )
    sys.exit(1)

FLASH_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
]

SPEC_PROMPT = """You are analyzing a YouTube tutorial video. Watch carefully and produce a structured build specification.

Focus area: {focus}
Time window: 0 to {end} seconds.

Write your analysis in these six sections:

1. **What is being built** — the end result, in one sentence.
2. **Stack and dependencies** — every tool, library, version, and service mentioned or visible on screen. Include exact version numbers when shown.
3. **Step by step build order** — the exact sequence of actions shown in the tutorial. Use the presenter's own words for commands and file names.
4. **Configuration and environment** — env vars, API keys, config files, ports, and settings shown or mentioned.
5. **Prerequisites the presenter assumed** — things mentioned in passing as already set up, or visible in the environment but never explained.
6. **Gotchas and warnings** — anything the presenter flagged as easy to get wrong, common mistakes, or "make sure you do X".

Rules:
- Report exact strings you see on screen (commands, file names, error messages). These are evidence.
- Do NOT report timestamps, durations, or counts — vision models reconstruct these unreliably.
- If you cannot read something on screen, say so rather than guessing.
- Distinguish what was shown from what you are inferring from general knowledge.
- If the presenter says something that contradicts what is on screen, report both.
"""


def call_gemini(client, url, focus, end, fps):
    video_part = types.Part.from_uri(file_uri=url, mime_type="video/*")
    prompt = SPEC_PROMPT.format(focus=focus, end=end)

    for model in FLASH_MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[video_part, prompt],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                ),
            )
            return model, response.text
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower():
                print(
                    f"  Model {model}: rate limited, trying next...",
                    file=sys.stderr,
                )
                continue
            elif "404" in err_str or "not found" in err_str.lower():
                print(
                    f"  Model {model}: not available, trying next...",
                    file=sys.stderr,
                )
                continue
            else:
                print(f"  Model {model}: {e}", file=sys.stderr)
                continue

    return None, None


def main():
    parser = argparse.ArgumentParser(
        description="Send a YouTube video to Gemini for independent analysis"
    )
    parser.add_argument("url", help="YouTube video URL")
    parser.add_argument(
        "--samples",
        type=int,
        default=2,
        help="Number of independent samples (default: 2)",
    )
    parser.add_argument(
        "--end",
        type=int,
        default=600,
        help="Analyze up to this many seconds (default: 600)",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=0,
        help="Start analysis from this second (default: 0)",
    )
    parser.add_argument(
        "--focus",
        default="the whole build process",
        help="What to focus the analysis on",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=1.0,
        help="Frames per second hint (default: 1.0)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print(
            "ERROR: GEMINI_API_KEY not set. Get one at aistudio.google.com/apikey",
            file=sys.stderr,
        )
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    effective_end = args.end
    if args.start > 0:
        effective_end = args.end - args.start

    print(f"# Gemini Video Analysis\n", flush=True)
    print(f"- **URL**: {args.url}")
    print(f"- **Window**: {args.start}s to {args.end}s")
    print(f"- **Focus**: {args.focus}")
    print(f"- **Samples**: {args.samples}\n")

    for i in range(args.samples):
        sample_num = i + 1
        print(f"---\n\n## Sample {sample_num}\n", flush=True)
        print(f"Running sample {sample_num}/{args.samples}...", file=sys.stderr)

        model_used, text = call_gemini(
            client, args.url, args.focus, effective_end, args.fps
        )

        if model_used and text:
            print(f"*Model: {model_used}*\n")
            print(text)
            print()
        else:
            print(
                "**ERROR**: All models failed. Check your GEMINI_API_KEY and quota.\n"
            )
            print(
                "All models exhausted for sample {sample_num}.",
                file=sys.stderr,
            )

        if sample_num < args.samples:
            time.sleep(2)

    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
