// Sky Jellyfish — a make.fun ai-excited-01 entry (Node 22, standard library only).
//
// The entry image lives beside this file as entry.png (JPEG bytes under that
// name, which the gate accepts: it tells PNG from JPEG by the first bytes).
// This program copies those exact bytes to the output directory, after
// checking the file really is a whole image within the gate's limits.
// Because it is a plain byte copy, two runs always produce identical bytes.
//
// Run it outside the grader's container with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1048576;
const MAX_SIDE = 1024;

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'entry.png');
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outPath = join(outDir, 'entry.png');

if (!existsSync(sourcePath)) {
  throw new Error(`entry image missing: ${sourcePath}`);
}

const bytes = readFileSync(sourcePath);

const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
if (!isPng && !isJpeg) {
  throw new Error('entry.png is neither a PNG nor a JPEG (checked by magic bytes)');
}
if (isJpeg && (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)) {
  throw new Error('JPEG entry is truncated: missing its end marker');
}
if (bytes.length > MAX_BYTES) {
  throw new Error(`entry.png is ${bytes.length} bytes, over the ${MAX_BYTES} byte limit`);
}

let width = 0;
let height = 0;
if (isPng) {
  width = bytes.readUInt32BE(16);
  height = bytes.readUInt32BE(20);
} else {
  // Walk the JPEG markers until the frame header (SOF0/SOF2) gives the size.
  let pos = 2;
  while (pos + 9 < bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    const marker = bytes[pos + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      height = bytes.readUInt16BE(pos + 5);
      width = bytes.readUInt16BE(pos + 7);
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const segLen = bytes.readUInt16BE(pos + 2);
    pos += 2 + segLen;
  }
}
if (width === 0 || height === 0) {
  throw new Error('could not read the entry image dimensions');
}
if (width > MAX_SIDE || height > MAX_SIDE) {
  throw new Error(`entry image is ${width}x${height}, over the ${MAX_SIDE}x${MAX_SIDE} limit`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, bytes);
console.log(`wrote ${outPath} (${width}x${height}, ${bytes.length} bytes)`);
