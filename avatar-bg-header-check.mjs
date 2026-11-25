import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Zero-dependency binary header validator for Roblox Avatar Backgrounds (2560x1440, no alpha, sRGB).
// Usage: node avatar-bg-header-check.mjs path/to/background.png
// Browser preview & 1-click JPG export: https://calcdenhq.com/roblox-avatar-background-template/

export const SPEC = { width: 2560, height: 1440, formats: ['PNG', 'JPG', 'TGA', 'BMP'] };

// Visible screen crops as [left, top, right, bottom] fractions (community measurements on the Nov 2026 launch thread).
export const SCREEN_CROPS = {
  webProfile: [0.136, 0.381, 0.864, 0.778],
  tabletEditor: [0.165, 0.198, 0.835, 0.990],
  phoneEditor: [0.219, 0.198, 0.779, 1.000],
  squareThumbnail: [0.365, 0.367, 0.633, 0.844],
};

const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));
const WIDE_GAMUT = /display p3|adobe rgb|prophoto|rec\.? ?2020|bt\.? ?2020|dci-p3/i;

function gamutName(b, from, to) {
  const text = String.fromCharCode(...b.subarray(from, Math.min(to, from + 4096))).replace(/\0/g, '');
  return text.match(WIDE_GAMUT)?.[0] ?? null;
}

export function inspectHeader(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 26) return null;

  // PNG: IHDR + tRNS/iCCP/cICP chunks before IDAT
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') {
    const width = u32be(b, 16), height = u32be(b, 20), colorType = b[25];
    let alpha = colorType === 4 || colorType === 6;
    let profile = null;
    for (let i = 8; i + 8 <= b.length;) {
      const len = u32be(b, i), type = ascii(b, i + 4, 4);
      if (type === 'tRNS') alpha = true;
      if (type === 'iCCP') profile = gamutName(b, i + 8, i + 8 + Math.min(len, 80)) || null;
      if (type === 'cICP' && b[i + 8] === 12) profile = 'Display P3';
      if (type === 'IDAT' || type === 'IEND') break;
      i += 12 + len;
    }
    return { format: 'PNG', width, height, alpha, profile };
  }

  // JPEG: walk markers to SOF frame header; ICC profile lives in APP2
  if (b[0] === 0xff && b[1] === 0xd8) {
    let profile = null;
    for (let i = 2; i + 4 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = u16be(b, i + 2);
      if (m === 0xe2 && ascii(b, i + 4, 11) === 'ICC_PROFILE') profile = gamutName(b, i + 4, i + 2 + len);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        return { format: 'JPG', width: u16be(b, i + 7), height: u16be(b, i + 5), alpha: false, profile };
      }
      if (m === 0xd9 || m === 0xda) break;
      i += 2 + len;
    }
    return null;
  }

  // BMP: 32-bit or bitfield alpha mask
  if (ascii(b, 0, 2) === 'BM') {
    const header = u32le(b, 14), width = u32le(b, 18), h = u32le(b, 22) | 0;
    const bpp = u16le(b, 28), comp = u32le(b, 30);
    const alphaMask = header >= 56 && (comp === 3 || comp === 6) ? u32le(b, 54) : 0;
    return { format: 'BMP', width, height: Math.abs(h), alpha: bpp === 32 || alphaMask !== 0, profile: null };
  }

  // TGA: validate header fields (no magic signature)
  const imageType = b[2], bpp = b[16];
  if ([1, 2, 3, 9, 10, 11].includes(imageType) && [8, 15, 16, 24, 32].includes(bpp) && b[1] <= 1) {
    return { format: 'TGA', width: u16le(b, 12), height: u16le(b, 14), alpha: (b[17] & 0x0f) > 0 || bpp === 32, profile: null };
  }
  return null;
}

export function validateBackground(info) {
  if (!info) return { pass: false, issues: ['Unsupported file format (must be PNG, JPG, TGA, or BMP)'] };
  const issues = [];
  if (info.width !== SPEC.width || info.height !== SPEC.height) {
    issues.push(`Wrong size: ${info.width}x${info.height} (Roblox requires exactly 2560x1440)`);
  }
  if (info.alpha) {
    issues.push('Contains an alpha channel (Roblox rejects RGBA/tRNS files even if visually opaque)');
  }
  if (info.profile) {
    issues.push(`Wide-gamut profile detected (${info.profile}); export as sRGB`);
  }
  return { pass: issues.length === 0, issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node avatar-bg-header-check.mjs <image-file>');
    console.log('Spec:', SPEC);
    console.log('Measured screen crops:', SCREEN_CROPS);
    process.exit(0);
  }
  const info = inspectHeader(readFileSync(target));
  const res = validateBackground(info);
  console.log({ file: target, info, ...res });
  if (!res.pass) process.exit(1);
}
