#!/usr/bin/env python3
"""
extract-viral-clips.py — Extract viral-worthy audio clips from Podify episodes.

Pipeline:
  1. Build timestamped transcript from existing clips + transcript.json (fast, free)
     Falls back to faster-whisper API if no pre-split clips exist
  2. Send timestamped transcript to Claude to identify top viral hooks
  3. Extract audio clips with ffmpeg
  4. Generate SRT subtitles per clip
  5. Output JSON manifest for Content Creator / Spellcast integration

Usage:
  python scripts/extract-viral-clips.py .podify-output/2026-02-14_kitchen-witchcraft-101/
  python scripts/extract-viral-clips.py .podify-output/2026-02-14_kitchen-witchcraft-101/ --top 3
  python scripts/extract-viral-clips.py .podify-output/2026-02-14_kitchen-witchcraft-101/ --min-duration 15 --max-duration 45

Requires:
  - OPENROUTER_API_KEY in .env.local or environment
  - ffmpeg installed
  - (Optional) Local faster-whisper API at localhost:9001 for word-level SRT generation
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import requests

WHISPER_API = os.environ.get("WHISPER_API_URL", "http://localhost:9001")
OPENROUTER_API_KEY = None


def load_env():
    """Load OPENROUTER_API_KEY from .env.local or environment."""
    global OPENROUTER_API_KEY
    OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
    if not OPENROUTER_API_KEY:
        env_file = Path(__file__).resolve().parent.parent / ".env.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("OPENROUTER_API_KEY="):
                    OPENROUTER_API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not OPENROUTER_API_KEY:
        print("Error: OPENROUTER_API_KEY not found in environment or .env.local")
        sys.exit(1)


def find_mp3(episode_dir: Path) -> Path:
    """Find the main MP3 file in the episode directory."""
    mp3s = list(episode_dir.glob("*.mp3"))
    if not mp3s:
        print(f"Error: No MP3 file found in {episode_dir}")
        sys.exit(1)
    main = [f for f in mp3s if "clip" not in f.name]
    return main[0] if main else mp3s[0]


def get_audio_duration(file_path: Path) -> float:
    """Get duration of an audio file using ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(file_path)],
        capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def build_timestamped_transcript(episode_dir: Path) -> list[dict]:
    """Build a timestamped transcript from existing Podify clips + transcript.json.

    Uses ffprobe to get the duration of each pre-split clip, then calculates
    cumulative timestamps. This is fast, free, and accurate since Podify already
    split the audio per speaker turn with known silence gaps.
    """
    transcript_file = episode_dir / "transcript.json"
    clips_dir = episode_dir / ".work" / "clips"

    if not transcript_file.exists():
        print("Error: No transcript.json found")
        sys.exit(1)
    if not clips_dir.exists():
        print("Error: No .work/clips directory found")
        sys.exit(1)

    transcript = json.loads(transcript_file.read_text())

    # Get sorted clip files
    clip_files = sorted(clips_dir.glob("clip_*.mp3"))
    if len(clip_files) != len(transcript):
        print(f"Warning: {len(clip_files)} clips but {len(transcript)} transcript lines")
        # Use whichever is shorter
        count = min(len(clip_files), len(transcript))
        clip_files = clip_files[:count]
        transcript = transcript[:count]

    # Podify assembles with silence gaps:
    # 800ms between different speakers, 300ms for same speaker
    CROSS_SPEAKER_GAP = 0.8
    SAME_SPEAKER_GAP = 0.3

    segments = []
    cursor = 0.0  # current position in the assembled audio

    for i, (clip_file, line) in enumerate(zip(clip_files, transcript)):
        duration = get_audio_duration(clip_file)
        start = cursor
        end = cursor + duration

        segments.append({
            "index": i,
            "speaker": line["speaker"],
            "text": line["text"],
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(duration, 3),
        })

        # Advance cursor past this clip + gap
        cursor = end
        if i < len(transcript) - 1:
            next_speaker = transcript[i + 1]["speaker"]
            gap = SAME_SPEAKER_GAP if line["speaker"] == next_speaker else CROSS_SPEAKER_GAP
            cursor += gap

    total_duration = segments[-1]["end"] if segments else 0
    print(f"  Built transcript: {len(segments)} segments, {total_duration:.1f}s total")
    return segments


def identify_viral_hooks(
    segments: list[dict],
    episode_title: str,
    top_n: int,
    min_duration: int,
    max_duration: int,
) -> list[dict]:
    """Use Claude to identify the most viral-worthy segments."""
    segments_text = ""
    for seg in segments:
        segments_text += f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['speaker']}: {seg['text']}\n"

    prompt = f"""You are analysing a podcast transcript to find the most viral-worthy segments for short-form social media video (TikTok, Reels, Shorts).

Episode title: "{episode_title}"

Timestamped transcript with speaker labels:
{segments_text}

Find the top {top_n} most viral segments. Each segment should be:
- Between {min_duration} and {max_duration} seconds long
- Self-contained (makes sense without context)
- Has a strong hook in the first 3 seconds (pattern interrupt, surprising fact, relatable scenario, quotable line)
- High save/share potential (actionable tips, quotable metaphors, emotional resonance)
- Optimised for watch time (the kind of content that makes people stop scrolling)
- Can span multiple consecutive speaker turns (combine 2-4 turns for natural dialogue clips)

For each segment, use the EXACT start and end timestamps from the transcript. A segment can start at one speaker turn's start_time and end at another turn's end_time.

Return ONLY a JSON array, no markdown, no explanation:
[
  {{
    "rank": 1,
    "hook_type": "pattern_interrupt|relatable_shock|quotable_metaphor|actionable_list|trending_topic|inspirational",
    "title": "Short title for this clip (5-8 words)",
    "why_viral": "One sentence explaining why this segment would perform well",
    "start_time": 0.0,
    "end_time": 30.0,
    "transcript_text": "The exact text spoken in this segment",
    "suggested_caption": "A short social media caption for this clip (under 150 chars)",
    "platforms": ["tiktok", "reels", "shorts"]
  }}
]"""

    print(f"  Asking Claude to identify top {top_n} viral hooks...")
    r = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://lunary.app",
            "X-Title": "Podify Viral Clip Extractor",
        },
        json={
            "model": "deepseek/deepseek-chat-v3-5",
            "messages": [
                {"role": "system", "content": "You identify viral-worthy segments from podcast transcripts. Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 4096,
            "temperature": 0.3,
        },
        timeout=120,
    )

    if r.status_code != 200:
        print(f"Error: OpenRouter returned {r.status_code}: {r.text}")
        sys.exit(1)

    raw = r.json()["choices"][0]["message"]["content"].strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    hooks = json.loads(raw)
    print(f"  Found {len(hooks)} viral hooks")
    return hooks


def extract_clip(
    mp3_path: Path,
    output_path: Path,
    start_time: float,
    end_time: float,
    fade_ms: int = 200,
) -> Path:
    """Extract an audio clip with ffmpeg, applying short fade in/out."""
    duration = end_time - start_time
    fade_s = fade_ms / 1000.0
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_time),
        "-t", str(duration),
        "-i", str(mp3_path),
        "-af", f"afade=t=in:st=0:d={fade_s},afade=t=out:st={duration - fade_s}:d={fade_s}",
        "-codec:a", "libmp3lame",
        "-q:a", "2",
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return output_path


def generate_srt_from_segments(
    segments: list[dict],
    start_time: float,
    end_time: float,
) -> str:
    """Generate SRT subtitles from the timestamped transcript segments."""
    clip_segments = [
        s for s in segments
        if s["start"] >= start_time - 0.5 and s["end"] <= end_time + 0.5
    ]
    if not clip_segments:
        return ""

    srt = ""
    idx = 1
    for seg in clip_segments:
        # Split long text into ~10 word chunks for readable subtitles
        words = seg["text"].split()
        chunk_size = 10
        seg_start = seg["start"] - start_time
        seg_duration = seg["duration"]
        words_per_sec = len(words) / seg_duration if seg_duration > 0 else 10

        for i in range(0, len(words), chunk_size):
            chunk = words[i:i + chunk_size]
            chunk_start = seg_start + (i / words_per_sec)
            chunk_end = seg_start + (min(i + chunk_size, len(words)) / words_per_sec)
            text = " ".join(chunk)
            srt += f"{idx}\n{format_srt_time(chunk_start)} --> {format_srt_time(chunk_end)}\n{text}\n\n"
            idx += 1
    return srt


def format_srt_time(seconds: float) -> str:
    """Format seconds as SRT timestamp HH:MM:SS,mmm."""
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    parser = argparse.ArgumentParser(description="Extract viral clips from Podify episodes")
    parser.add_argument("episode_dir", type=str, help="Path to Podify episode directory")
    parser.add_argument("--top", type=int, default=5, help="Number of viral hooks to extract (default: 5)")
    parser.add_argument("--min-duration", type=int, default=15, help="Minimum clip duration in seconds (default: 15)")
    parser.add_argument("--max-duration", type=int, default=45, help="Maximum clip duration in seconds (default: 45)")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory for clips (default: episode_dir/viral-clips)")
    args = parser.parse_args()

    episode_dir = Path(args.episode_dir).resolve()
    if not episode_dir.is_dir():
        print(f"Error: {episode_dir} is not a directory")
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else episode_dir / "viral-clips"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Derive episode title from directory name
    dir_name = episode_dir.name
    if "_" in dir_name:
        title_part = dir_name.split("_", 1)[1]
    else:
        title_part = dir_name
    episode_title = title_part.replace("-", " ").title()

    print(f"\n  Extracting viral clips from: {episode_title}")
    print(f"  Output: {output_dir}\n")

    # Setup
    load_env()

    # Step 1: Build timestamped transcript from existing clips
    mp3_path = find_mp3(episode_dir)
    segments = build_timestamped_transcript(episode_dir)

    # Step 2: Identify viral hooks via Claude
    hooks = identify_viral_hooks(
        segments,
        episode_title,
        top_n=args.top,
        min_duration=args.min_duration,
        max_duration=args.max_duration,
    )

    # Step 3: Extract clips and generate SRTs
    manifest = {
        "episode_title": episode_title,
        "episode_dir": str(episode_dir),
        "source_audio": str(mp3_path),
        "source_duration": get_audio_duration(mp3_path),
        "clips": [],
    }

    for hook in hooks:
        rank = hook["rank"]
        start = hook["start_time"]
        end = hook["end_time"]
        slug = hook["title"].lower().replace(" ", "-").replace("'", "")[:40]
        clip_filename = f"clip_{rank:02d}_{slug}.mp3"
        srt_filename = f"clip_{rank:02d}_{slug}.srt"

        print(f"\n  [{rank}] {hook['title']}")
        print(f"      {hook['hook_type']} | {start:.1f}s - {end:.1f}s ({end - start:.1f}s)")
        print(f"      {hook['why_viral']}")

        # Extract audio
        clip_path = extract_clip(mp3_path, output_dir / clip_filename, start, end)
        print(f"      -> {clip_path.name}")

        # Generate SRT from transcript segments
        srt_content = generate_srt_from_segments(segments, start, end)
        srt_path = output_dir / srt_filename
        srt_path.write_text(srt_content)
        print(f"      -> {srt_path.name}")

        manifest["clips"].append({
            **hook,
            "audio_file": clip_filename,
            "srt_file": srt_filename,
            "duration": round(end - start, 1),
        })

    # Step 4: Write manifest
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\n  Manifest: {manifest_path}")
    print(f"\n  Done! {len(hooks)} viral clips extracted to {output_dir}")
    print(f"  Next: feed clips into Content Creator for captioned video, then schedule via Spellcast.\n")


if __name__ == "__main__":
    main()
