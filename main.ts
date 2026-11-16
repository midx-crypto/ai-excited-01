import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1048576;
const MAX_DIM = 1024;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 33) return null;
  if (buf.readUInt32BE(12) !== 0x49484452) return null; // "IHDR"
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    if (
      marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
      marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
      marker === 0xc9 || marker === 0xca || marker === 0xcb ||
      marker === 0xcd || marker === 0xce || marker === 0xcf
    ) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function describe(buf: Buffer): { kind: string; width: number; height: number } {
  const isPng = buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (isPng) {
    const d = pngDimensions(buf);
    if (!d) fail("entry.png is not a whole PNG: IHDR missing or truncated");
    return { kind: "PNG", ...d };
  }
  if (isJpeg) {
    if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
      fail("entry.png is not a whole JPEG: end marker missing");
    }
    const d = jpegDimensions(buf);
    if (!d) fail("entry.png is not a whole JPEG: no SOF frame found");
    return { kind: "JPEG", ...d };
  }
  fail("entry.png has unknown magic bytes: not PNG or JPEG");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const source = join(scriptDir, "entry.png");
const outDir = (process.env.MAKEFUN_OUTPUT_DIR || "").trim() || "/output";
const target = join(outDir, "entry.png");

if (!existsSync(source)) fail(`source image not found: ${source}`);
const data = readFileSync(source);
if (data.length === 0) fail("entry.png is empty");
if (data.length > MAX_BYTES) fail(`entry.png is ${data.length} bytes, over the 1048576 byte limit`);
const info = describe(data);
if (info.width > MAX_DIM || info.height > MAX_DIM) {
  fail(`entry.png is ${info.width}x${info.height}, over the 1024x1024 limit`);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(source, target);

const written = readFileSync(target);
if (!written.equals(data)) fail("output differs from source after copy");
const outInfo = describe(written);
if (outInfo.width !== info.width || outInfo.height !== info.height) {
  fail(`output dimensions ${outInfo.width}x${outInfo.height} differ from source ${info.width}x${info.height}`);
}
if (written.length > MAX_BYTES) fail(`output is ${written.length} bytes, over the 1048576 byte limit`);
const stat = statSync(target);
console.log(`wrote ${target}: ${info.kind} ${info.width}x${info.height}, ${stat.size} bytes, verified byte-identical`);
