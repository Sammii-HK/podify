// ============================================================
// Stage 3: Audio Assembly
// Merges individual clips into final podcast with music
// ============================================================

import { writeFile, readFile } from "fs/promises";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { AudioClip, PodcastConfig } from "@/lib/types";
import { getFFmpegPath } from "@/lib/ffmpeg";

export type ProgressCallback = (message: string, percent: number) => void;

/**
 * Normalize all TTS clips to consistent WAV format, then concatenate.
 * TTS providers return varied formats (MP2/MP3, different sample rates)
 * so we normalize everything to 24kHz mono WAV first.
 */
async function buildDialogue(
  ffmpeg: string,
  clips: AudioClip[],
  workDir: string,
  outputPath: string
): Promise<void> {
  const normDir = join(workDir, "norm");
  execSync(`mkdir -p "${normDir}"`);

  // Normalize each clip + generate silence gaps as WAV
  const parts: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const normPath = resolve(join(normDir, `c${String(i).padStart(3, "0")}.wav`));
    execSync(
      `"${ffmpeg}" -y -i "${resolve(clips[i].filePath)}" -ar 44100 -ac 2 -c:a pcm_s16le "${normPath}"`,
      { stdio: "pipe" }
    );
    parts.push(normPath);

    // Add silence between clips
    if (i < clips.length - 1) {
      const gapMs = clips[i].speaker !== clips[i + 1].speaker ? 800 : 300;
      const gapPath = resolve(join(normDir, `g${String(i).padStart(3, "0")}.wav`));
      execSync(
        `"${ffmpeg}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${gapMs / 1000} -c:a pcm_s16le "${gapPath}"`,
        { stdio: "pipe" }
      );
      parts.push(gapPath);
    }
  }

  // Write concat file with absolute paths
  const concatPath = join(workDir, "concat.txt");
  const concatContent = parts.map((p) => `file '${p}'`).join("\n");
  await writeFile(concatPath, concatContent);

  // Concatenate all WAV parts into final MP3 (44.1kHz stereo, 192kbps for quality)
  execSync(
    `"${ffmpeg}" -y -f concat -safe 0 -i "${concatPath}" -ar 44100 -ac 2 -c:a libmp3lame -b:a 192k "${outputPath}"`,
    { stdio: "pipe" }
  );
}

/**
 * Mix dialogue with background music
 */
function mixWithMusic(
  ffmpeg: string,
  dialoguePath: string,
  musicPath: string,
  outputPath: string,
  musicVolume: number = 0.10
): void {
  execSync(
    `"${ffmpeg}" -y -i "${dialoguePath}" -stream_loop -1 -i "${musicPath}" \
     -filter_complex "[1:a]volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=3" \
     -c:a libmp3lame -q:a 2 "${outputPath}"`,
    { stdio: "pipe" }
  );
}

/**
 * Add intro and outro if available
 */
function addIntroOutro(
  ffmpeg: string,
  mainPath: string,
  outputPath: string,
  introPath?: string,
  outroPath?: string
): void {
  if (!introPath && !outroPath) {
    execSync(`cp "${mainPath}" "${outputPath}"`);
    return;
  }

  const parts: string[] = [];
  if (introPath) parts.push(`file '${introPath}'`);
  parts.push(`file '${mainPath}'`);
  if (outroPath) parts.push(`file '${outroPath}'`);

  const tmpConcat = mainPath.replace(".mp3", "_final_concat.txt");
  execSync(`echo '${parts.join("\n")}' > "${tmpConcat}"`);
  execSync(
    `"${ffmpeg}" -y -f concat -safe 0 -i "${tmpConcat}" -c:a libmp3lame -q:a 2 "${outputPath}"`,
    { stdio: "pipe" }
  );
}

/**
 * Get duration of an audio file in seconds
 */
function getAudioDuration(ffmpeg: string, filePath: string): number {
  try {
    const stderr = execSync(
      `"${ffmpeg}" -i "${filePath}" -f null - 2>&1`,
      { encoding: "utf-8" }
    );
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (!match) return 0;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
  } catch {
    return 0;
  }
}

// ============================================================
// Main export
// ============================================================

export async function assemblePodcast(
  clips: AudioClip[],
  config: PodcastConfig,
  workDir: string,
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<{ durationSeconds: number }> {
  const ffmpeg = await getFFmpegPath();
  console.log(`🎧 Assembling podcast... (ffmpeg: ${ffmpeg})`);
  onProgress?.("Assembling podcast...", 82);

  // Step 1: Normalize clips and concatenate with pauses
  const dialoguePath = join(workDir, "dialogue.mp3");
  await buildDialogue(ffmpeg, clips, workDir, dialoguePath);
  console.log(`   ✅ Dialogue track assembled`);
  onProgress?.("Dialogue track assembled", 87);

  // Step 2: Mix with background music if requested
  const audioDir = join(process.cwd(), "public", "audio");
  const musicPath = join(audioDir, "ambient-cosmic.mp3");
  let mixedPath = dialoguePath;

  if (config.includeMusic) {
    try {
      await readFile(musicPath);
      mixedPath = join(workDir, "mixed.mp3");
      mixWithMusic(ffmpeg, dialoguePath, musicPath, mixedPath, 0.10);
      console.log(`   ✅ Background music mixed`);
      onProgress?.("Background music mixed", 90);
    } catch {
      console.log(`   ⚠️  No background music found at ${musicPath}, skipping`);
    }
  }

  // Step 3: Add intro/outro if available
  const introPath = join(audioDir, "intro.mp3");
  const outroPath = join(audioDir, "outro.mp3");

  let hasIntro = false;
  let hasOutro = false;
  try {
    await readFile(introPath);
    hasIntro = true;
  } catch {}
  try {
    await readFile(outroPath);
    hasOutro = true;
  } catch {}

  addIntroOutro(
    ffmpeg,
    mixedPath,
    outputPath,
    hasIntro ? introPath : undefined,
    hasOutro ? outroPath : undefined
  );

  const durationSeconds = getAudioDuration(ffmpeg, outputPath);
  console.log(`   ✅ Final podcast: ${Math.floor(durationSeconds / 60)}m ${Math.round(durationSeconds % 60)}s`);
  console.log(`   📁 Output: ${outputPath}`);
  onProgress?.("Assembly complete", 95);

  return { durationSeconds };
}
