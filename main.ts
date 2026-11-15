// Sky Jellyfish — make.fun ai-excited-01 entry (Node 22, standard library only).
//
// entry.png sits next to this file (JPEG bytes under a .png name; the gate
// sniffs the format from the first bytes, so that is fine). This script
// copies those bytes verbatim into the output directory, then proves the
// copy is good: it reads the output back, checks every byte matches the
// source, and checks the size stays within the 1 MiB gate limit. A plain
// byte copy plus a read-back check means two runs always agree.
//
// Run it outside the grader's container with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1024;

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'entry.png');
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outPath = join(outDir, 'entry.png');

function fail(message: string): never {
  throw new Error(message);
}

function readDimensions(bytes: Buffer): { width: number; height: number } {
  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpeg =
    bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (!isPng && !isJpeg) {
    fail('entry.png is neither PNG nor JPEG (checked by magic bytes)');
  }
  if (isJpeg && (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)) {
    fail('JPEG entry is truncated: missing the end-of-image marker');
  }

  if (isPng) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // JPEG: walk the markers until a frame header (SOF0/SOF2) gives the size.
  let pos = 2;
  while (pos + 9 < bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    const marker = bytes[pos + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { width: bytes.readUInt16BE(pos + 7), height: bytes.readUInt16BE(pos + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    pos += 2 + bytes.readUInt16BE(pos + 2);
  }
  fail('could not read the entry image dimensions');
}

// After writing, read the output back and prove it is the same file:
// same length, same bytes, same dimensions, and still inside the gate's
// size limit. Byte equality alone would catch most bad writes; checking
// the dimensions too catches a write that got the right length but the
// wrong content in its header.
function verifyOutput(source: Buffer, path: string, width: number, height: number): void {
  if (!existsSync(path)) {
    fail(`verification failed: output file was not created at ${path}`);
  }
  const written = readFileSync(path);
  if (written.length > MAX_BYTES) {
    fail(`verification failed: output is ${written.length} bytes, over the ${MAX_BYTES} byte limit`);
  }
  if (written.length !== source.length) {
    fail(
      `verification failed: output is ${written.length} bytes but the source is ${source.length} bytes`,
    );
  }
  if (!written.equals(source)) {
    fail('verification failed: output bytes differ from the source image');
  }
  const outDims = readDimensions(written);
  if (outDims.width !== width || outDims.height !== height) {
    fail(
      `verification failed: output is ${outDims.width}x${outDims.height}, ` +
        `expected ${width}x${height}`,
    );
  }
}

function main(): void {
  if (!existsSync(sourcePath)) {
    fail(`entry image missing: ${sourcePath}`);
  }

  const bytes = readFileSync(sourcePath);
  if (bytes.length > MAX_BYTES) {
    fail(`entry.png is ${bytes.length} bytes, over the ${MAX_BYTES} byte limit`);
  }

  const { width, height } = readDimensions(bytes);
  if (width === 0 || height === 0) {
    fail('could not read the entry image dimensions');
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    fail(`entry image is ${width}x${height}, over the ${MAX_SIDE}x${MAX_SIDE} limit`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, bytes);

  verifyOutput(bytes, outPath, width, height);
  console.log(`wrote ${outPath} (${width}x${height}, ${bytes.length} bytes) — verified byte-identical`);
}

try {
  main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
