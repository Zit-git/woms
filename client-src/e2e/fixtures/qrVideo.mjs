import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import QRCode from 'qrcode';

// A fake camera for headless Chromium: an MJPEG file that shows each code in turn (a QR on a white 640x480
// frame, then a blank gap), looping. Used with --use-file-for-fake-video-capture, so the real scanner code runs
// against real frames. Needs macOS `sips` (PNG -> padded JPEG).
export async function makeQrVideo(codes, outFile, { framesPerCode = 90, gapFrames = 45, qrPixels = 200 } = {}) {
  const dir = path.dirname(outFile);
  fs.mkdirSync(dir, { recursive: true });
  const jpeg = (name, make) => {
    const png = path.join(dir, `${name}.png`);
    const jpg = path.join(dir, `${name}.jpg`);
    return make(png).then(() => {
      execFileSync('sips', ['-p', '480', '640', '--padColor', 'FFFFFF', png, '--out', png], { stdio: 'ignore' });
      execFileSync('sips', ['-s', 'format', 'jpeg', png, '--out', jpg], { stdio: 'ignore' });
      return fs.readFileSync(jpg);
    });
  };
  const blank = await jpeg('blank', (png) => QRCode.toFile(png, 'x', { width: 8, margin: 0, color: { dark: '#FFFFFF', light: '#FFFFFF' } }));
  const chunks = [];
  for (const [i, code] of codes.entries()) {
    const frame = await jpeg(`code${i}`, (png) => QRCode.toFile(png, code, { width: qrPixels, margin: 2 }));
    for (let k = 0; k < framesPerCode; k++) chunks.push(frame);
    for (let k = 0; k < gapFrames; k++) chunks.push(blank);
  }
  fs.writeFileSync(outFile, Buffer.concat(chunks));
  return outFile;
}
