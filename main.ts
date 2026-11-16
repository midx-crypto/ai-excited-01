import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1048576;
const MAX_SIDE = 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function pngSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.toString("ascii", 12, 16) !== "IHDR") {
    fail("PNG header is truncated or missing IHDR");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } {
  let pos = 2;
  while (pos + 9 <= buf.length) {
    if (buf[pos] !== 0xff) fail("JPEG segment marker expected while scanning for size");
    let marker = buf[pos + 1];
    while (marker === 0xff) {
      pos += 1;
      marker = buf[pos + 1];
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    if (marker === 0xda) fail("JPEG size frame not found before image data");
    if (pos + 4 > buf.length) fail("JPEG segment is truncated");
    const len = buf.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > buf.length) fail("JPEG segment length is out of range");
    if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) {
      if (len < 7) fail("JPEG size frame is too short");
      return { height: buf.readUInt16BE(pos + 5), width: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + len;
  }
  fail("JPEG size frame not found");
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = join(here, "entry.png");
  if (!existsSync(source)) fail(`entry.png not found next to main.ts (${source})`);

  const bytes = readFileSync(source);
  if (bytes.length === 0) fail("entry.png is empty");
  if (bytes.length > MAX_BYTES) {
    fail(`entry.png is ${bytes.length} bytes, over the 1048576 byte limit`);
  }

  let kind: string;
  let size: { width: number; height: number };
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    kind = "PNG";
    size = pngSize(bytes);
  } else if (bytes.subarray(0, 3).equals(JPEG_MAGIC)) {
    kind = "JPEG";
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      fail("JPEG data is missing its end marker (FF D9)");
    }
    size = jpegSize(bytes);
  } else {
    fail("entry.png is neither PNG nor JPEG (magic bytes do not match)");
  }
  if (size.width <= 0 || size.height <= 0) fail(`bad image size ${size.width}x${size.height}`);
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) {
    fail(`image is ${size.width}x${size.height}, over the 1024x1024 limit`);
  }

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, "entry.png");
  writeFileSync(dest, bytes);

  const back = readFileSync(dest);
  if (!back.equals(bytes)) fail("output differs from entry.png after writing");

  console.log(`entry.png: ${size.width}x${size.height} ${kind} ${bytes.length} bytes -> ${dest}`);
}

main();
