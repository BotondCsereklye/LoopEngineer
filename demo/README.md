# Demo

These clips show the provider check, dry run and controlled development loop without touching a real Claude Code or Codex session.

## Provider connections

Loop Engineer checks the installed official CLIs and reports only installed and authenticated state. Credentials remain inside each provider's own credential store.

![Provider connection check](clips/01-provider-connections.gif)

## Controlled loop

A dry run validates the workflow before any provider runs. A real run performs analysis, planning, implementation, tests and review in an isolated Git worktree.

![Dry run and controlled development loop](clips/02-controlled-loop.gif)

## Full video

[Watch the full MP4 demo](loop-engineer-demo.mp4).

## Rebuild the media

The renderer uses deterministic fixture text. It does not read `~/.claude`, `~/.codex`, repository source files, environment secrets or provider output.

Requirements:

- Python 3 with Pillow
- FFmpeg with H.264 and GIF encoders

```bash
python3 -m venv .venv-demo
.venv-demo/bin/pip install -r demo/requirements.txt
.venv-demo/bin/python demo/render_demo.py
```

The script writes the MP4, poster and GIF clips under `demo/`.
