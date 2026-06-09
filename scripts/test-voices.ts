import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const API_KEY = process.env.DEEPINFRA_API_KEY!;
const ffmpeg = '/Users/sammii/development/podify/node_modules/.pnpm/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/ffmpeg';
const OUT = '/tmp/ab-test';

const testText = "OK so closures. I used to think these were some mystical advanced concept, but they're actually everywhere in JavaScript. Like, every single function creates one.";

async function ttsKokoro(text: string, voice: string): Promise<Buffer> {
  const res = await fetch('https://api.deepinfra.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'hexgrad/Kokoro-82M', input: text, voice, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`Kokoro ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ttsOrpheus(text: string, voice: string): Promise<Buffer> {
  const res = await fetch('https://api.deepinfra.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'canopylabs/orpheus-3b-0.1-ft', input: text, voice, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`Orpheus ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function run() {
  mkdirSync(OUT, { recursive: true });

  // Kokoro voices
  const kokoroVoices = [
    'af_heart', 'af_aoede', 'af_bella', 'af_nicole', 'af_sky',
    'am_michael', 'am_adam', 'am_echo',
    'bf_emma', 'bf_isabella',
    'bm_george', 'bm_daniel', 'bm_lewis',
  ];

  // Orpheus voices
  const orpheusVoices = ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'];

  const allClips: string[] = [];

  console.log('=== KOKORO VOICES ===');
  for (const v of kokoroVoices) {
    try {
      console.log(`  Generating kokoro_${v}...`);
      const buf = await ttsKokoro(testText, v);
      const path = `${OUT}/kokoro_${v}.mp3`;
      writeFileSync(path, buf);
      allClips.push(path);
      console.log(`  Done (${buf.length} bytes)`);
    } catch (e: any) {
      console.log(`  FAILED: ${e.message}`);
    }
  }

  console.log('\n=== ORPHEUS VOICES ===');
  for (const v of orpheusVoices) {
    try {
      console.log(`  Generating orpheus_${v}...`);
      const buf = await ttsOrpheus(testText, v);
      const path = `${OUT}/orpheus_${v}.mp3`;
      writeFileSync(path, buf);
      allClips.push(path);
      console.log(`  Done (${buf.length} bytes)`);
    } catch (e: any) {
      console.log(`  FAILED: ${e.message}`);
    }
  }

  // Generate a combined sampler with announcements
  console.log('\nBuilding combined sampler...');
  const parts: string[] = [];

  for (const clip of allClips) {
    const name = clip.split('/').pop()!.replace('.mp3', '');
    // Generate announcement via Kokoro
    const annBuf = await ttsKokoro(`Voice: ${name.replace(/_/g, ' ')}`, 'af_heart');
    const annPath = `${OUT}/ann_${name}.mp3`;
    writeFileSync(annPath, annBuf);

    // Normalise to wav
    const annWav = `${OUT}/ann_${name}.wav`;
    const clipWav = `${OUT}/clip_${name}.wav`;
    const gapWav = `${OUT}/gap_${name}.wav`;

    execSync(`"${ffmpeg}" -y -i "${annPath}" -ar 44100 -ac 2 -c:a pcm_s16le "${annWav}"`, { stdio: 'pipe' });
    execSync(`"${ffmpeg}" -y -i "${clip}" -ar 44100 -ac 2 -c:a pcm_s16le "${clipWav}"`, { stdio: 'pipe' });
    execSync(`"${ffmpeg}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 1.0 -c:a pcm_s16le "${gapWav}"`, { stdio: 'pipe' });

    parts.push(annWav, clipWav, gapWav);
  }

  const listContent = parts.map(p => `file '${p}'`).join('\n');
  writeFileSync(`${OUT}/sampler_list.txt`, listContent);
  execSync(`"${ffmpeg}" -y -f concat -safe 0 -i "${OUT}/sampler_list.txt" -c:a libmp3lame -q:a 2 "${OUT}/all_voices_sampler.mp3"`, { stdio: 'pipe' });

  console.log(`\nDone! Sampler: ${OUT}/all_voices_sampler.mp3`);
  console.log(`Individual clips in: ${OUT}/`);
}

run().catch(e => console.error(e));
