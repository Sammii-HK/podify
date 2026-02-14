#!/bin/bash
# ============================================================
# Batch Generate Weekly Lunary Podcast Episodes
# ============================================================
# Usage: ./scripts/batch-generate.sh
#
# Generates episodes from a list of grimoire URLs.
# Edit the EPISODES array below to change weekly content.
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────

DURATION="5min"
FORMAT="conversation"
TONE="mystical"
VOICES="luna_and_sol"
TTS="deepinfra"
LLM="openrouter"

# ── This Week's Episodes ────────────────────────────────────
# Edit these each week, or read from a file

EPISODES=(
  "/grimoire/modern-witchcraft/witch-types/kitchen-witch"
  "/grimoire/modern-witchcraft/witch-types/cosmic-witch"
  "/grimoire/modern-witchcraft/witch-types/green-witch"
  "/grimoire/candle-magic/colors/red"
  "/grimoire/spells/moon-water-charging"
)

# ── Generate ─────────────────────────────────────────────────

TOTAL=${#EPISODES[@]}
echo "🎙️  Generating ${TOTAL} podcast episodes"
echo "   Duration: ${DURATION} | Format: ${FORMAT} | Tone: ${TONE}"
echo ""

SUCCESS=0
FAILED=0

for i in "${!EPISODES[@]}"; do
  EP="${EPISODES[$i]}"
  NUM=$((i + 1))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[${NUM}/${TOTAL}] ${EP}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if npx tsx src/pipeline.ts \
    --grimoire "${EP}" \
    --duration "${DURATION}" \
    --format "${FORMAT}" \
    --tone "${TONE}" \
    --voices "${VOICES}" \
    --tts "${TTS}" \
    --llm "${LLM}"; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILED=$((FAILED + 1))
    echo "   ❌ Failed to generate episode for ${EP}"
  fi

  # Rate limit between episodes
  if [ "${NUM}" -lt "${TOTAL}" ]; then
    echo "   ⏳ Waiting 3s..."
    sleep 3
  fi
done

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 BATCH COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ✅ Success: ${SUCCESS}/${TOTAL}"
echo "   ❌ Failed:  ${FAILED}/${TOTAL}"
echo "   📁 Output:  ./output/"
echo ""

# List generated files
echo "Generated episodes:"
ls -la output/*//*.mp3 2>/dev/null || echo "   (no MP3 files found)"
