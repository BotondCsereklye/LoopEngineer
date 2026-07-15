#!/usr/bin/env python3
"""Render Loop Engineer demo media without touching provider sessions.

The renderer draws deterministic fixture output with Pillow, streams raw frames
to FFmpeg, then derives compact GIF clips for the README.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "demo"
CLIPS_DIR = DEMO_DIR / "clips"
VIDEO_PATH = DEMO_DIR / "loop-engineer-demo.mp4"
POSTER_PATH = DEMO_DIR / "loop-engineer-demo-poster.png"

WIDTH = 1280
HEIGHT = 720
FPS = 24
DURATION = 23.0

COLORS = {
    "background": "#080b0f",
    "surface": "#10151b",
    "surface_2": "#151b22",
    "line": "#26303a",
    "text": "#f1f5f9",
    "muted": "#94a3b8",
    "green": "#22c55e",
    "blue": "#60a5fa",
    "orange": "#d97757",
    "yellow": "#fbbf24",
}

SCENES = [
    {
        "start": 2.0,
        "end": 7.2,
        "label": "PROVIDER CHECK",
        "command": "loopeng doctor",
        "outputs": [
            ("✓  Node.js       v22", "green"),
            ("✓  Git           worktrees available", "green"),
            ("✓  Claude Code   connected", "orange"),
            ("✓  OpenAI Codex  connected", "green"),
            ("✓  Checks        build · test · lint · typecheck", "blue"),
        ],
        "interval": 0.48,
    },
    {
        "start": 7.2,
        "end": 13.4,
        "label": "SAFE PREVIEW",
        "command": 'loopeng run --dry-run --task "Add input validation"',
        "outputs": [
            ("Configuration valid", "green"),
            ("Roles: analyst → planner → implementer → tester → reviewer", "text"),
            ("Quality gates: tests + clean review", "blue"),
            ("Dry run complete · no providers called", "green"),
            ("No files changed · no commit · no push", "muted"),
        ],
        "interval": 0.58,
    },
    {
        "start": 13.4,
        "end": 21.2,
        "label": "CONTROLLED LOOP",
        "command": 'loopeng run --task "Add input validation"',
        "outputs": [
            ("[1/7] Analyzing repository", "blue"),
            ("[2/7] Creating implementation plan", "blue"),
            ("[3/7] Isolated worktree created", "blue"),
            ("[4/7] Implementing scoped changes", "text"),
            ("[5/7] Tests passed", "green"),
            ("[6/7] Review clean", "green"),
            ("[7/7] Final validation", "blue"),
            ("READY FOR HUMAN REVIEW", "green"),
            ("Worktree: .loop-engineer/worktrees/run-demo", "muted"),
        ],
        "interval": 0.45,
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/SFNSMonoItalic.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    if bold:
        candidates.insert(0, "/System/Library/Fonts/SFNSMono.ttf")
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


FONT_SMALL = font(18)
FONT_BODY = font(27)
FONT_HEADER = font(20, bold=True)
FONT_TITLE = font(57, bold=True)
FONT_SUBTITLE = font(23)


def rounded_rectangle(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_shell(draw: ImageDraw.ImageDraw, label: str) -> None:
    rounded_rectangle(draw, (52, 54, 1228, 666), 18, COLORS["surface"], COLORS["line"], 2)
    draw.rounded_rectangle((52, 54, 1228, 112), radius=18, fill=COLORS["surface_2"])
    draw.rectangle((52, 92, 1228, 112), fill=COLORS["surface_2"])
    for x, color in [(84, "#fb7185"), (112, "#fbbf24"), (140, "#22c55e")]:
        draw.ellipse((x - 7, 76 - 7, x + 7, 76 + 7), fill=color)
    draw.text((174, 67), "loop-engineer  ·  safe fixture demo", font=FONT_SMALL, fill=COLORS["muted"])
    label_width = draw.textlength(label, font=FONT_SMALL)
    draw.text((1192 - label_width, 67), label, font=FONT_SMALL, fill=COLORS["green"])


def draw_intro(draw: ImageDraw.ImageDraw, t: float) -> None:
    progress = min(1.0, max(0.0, t / 0.7))
    title = "LOOP ENGINEER"
    title_width = draw.textlength(title, font=FONT_TITLE)
    x = (WIDTH - title_width) / 2
    draw.text((x, 260), title, font=FONT_TITLE, fill=COLORS["text"])
    line_width = int(390 * progress)
    draw.rounded_rectangle((WIDTH // 2 - line_width // 2, 337, WIDTH // 2 + line_width // 2, 343), radius=3, fill=COLORS["green"])
    subtitle = "Claude Code + OpenAI Codex · one controlled development loop"
    subtitle_width = draw.textlength(subtitle, font=FONT_SUBTITLE)
    draw.text(((WIDTH - subtitle_width) / 2, 372), subtitle, font=FONT_SUBTITLE, fill=COLORS["muted"])
    note = "local-first  ·  isolated worktrees  ·  human review"
    note_width = draw.textlength(note, font=FONT_SMALL)
    draw.text(((WIDTH - note_width) / 2, 430), note, font=FONT_SMALL, fill=COLORS["blue"])


def draw_scene(draw: ImageDraw.ImageDraw, scene: dict[str, object], t: float) -> None:
    draw_shell(draw, str(scene["label"]))
    local_t = t - float(scene["start"])
    command = str(scene["command"])
    typed_count = max(0, min(len(command), int((local_t - 0.25) * 32)))
    typed = command[:typed_count]
    cursor = "▌" if int(local_t * 3) % 2 == 0 and typed_count < len(command) else ""
    draw.text((92, 145), "$", font=FONT_BODY, fill=COLORS["green"])
    draw.text((126, 145), typed + cursor, font=FONT_BODY, fill=COLORS["text"])

    output_start = 0.25 + len(command) / 32 + 0.35
    interval = float(scene["interval"])
    outputs = list(scene["outputs"])
    for index, (line, color_key) in enumerate(outputs):
        if local_t >= output_start + index * interval:
            y = 205 + index * 41
            draw.text((92, y), str(line), font=FONT_BODY, fill=COLORS[str(color_key)])

    footer = "Credentials and real provider sessions are never used in this recording."
    draw.text((92, 620), footer, font=FONT_SMALL, fill=COLORS["muted"])


def draw_outro(draw: ImageDraw.ImageDraw, t: float) -> None:
    draw_shell(draw, "HUMAN HANDOFF")
    heading = "Inspect the diff. You decide what ships."
    draw.text((92, 210), heading, font=FONT_TITLE, fill=COLORS["text"])
    draw.text((94, 310), "Reports: Markdown + JSON", font=FONT_BODY, fill=COLORS["blue"])
    draw.text((94, 358), "Worktree: isolated and reviewable", font=FONT_BODY, fill=COLORS["green"])
    draw.text((94, 406), "Commit: never automatic", font=FONT_BODY, fill=COLORS["muted"])
    if int(t * 2) % 2 == 0:
        draw.rectangle((94, 477, 110, 508), fill=COLORS["green"])


def frame_at(t: float) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), COLORS["background"])
    draw = ImageDraw.Draw(image)
    if t < 2.0:
        draw_intro(draw, t)
        return image
    for scene in SCENES:
        if float(scene["start"]) <= t < float(scene["end"]):
            draw_scene(draw, scene, t)
            return image
    draw_outro(draw, t)
    return image


def run(command: list[str]) -> None:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)


def render_video() -> None:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("FFmpeg is required to render demo media")
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(VIDEO_PATH),
    ]
    process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_number in range(round(DURATION * FPS)):
            image = frame_at(frame_number / FPS)
            process.stdin.write(image.tobytes())
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise SystemExit("FFmpeg failed while encoding the demo video")
    frame_at(16.7).save(POSTER_PATH, optimize=True)


def render_gif(name: str, start: float, duration: float) -> None:
    target = CLIPS_DIR / name
    filter_graph = (
        "fps=12,scale=960:-2:flags=lanczos,split[s0][s1];"
        "[s0]palettegen=max_colors=96:stats_mode=diff[p];"
        "[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            str(start),
            "-t",
            str(duration),
            "-i",
            str(VIDEO_PATH),
            "-filter_complex",
            filter_graph,
            "-loop",
            "0",
            str(target),
        ]
    )


def main() -> None:
    render_video()
    render_gif("01-provider-connections.gif", 1.8, 5.6)
    render_gif("02-controlled-loop.gif", 7.3, 14.1)
    print(f"Rendered {VIDEO_PATH.relative_to(ROOT)}")
    for clip in sorted(CLIPS_DIR.glob("*.gif")):
        print(f"Rendered {clip.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
