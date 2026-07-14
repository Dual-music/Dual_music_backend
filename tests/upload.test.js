import { describe, expect, it } from 'vitest';

import { scanBuffer } from '../src/services/clamav.service.js';
import { confirmUpload } from '../src/services/upload.service.js';
import { detectFileType, detectMimeGroup } from '../src/utils/fileType.js';

/**
 * @file Upload safety tests: magic-byte detection, the (disabled) ClamAV hook,
 * and the storage-unavailable guard on confirmation. Full confirm flow (S3
 * round-trip) is exercised against real storage in integration.
 */

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const gif = Buffer.from('GIF89a');
const pdf = Buffer.from('%PDF-1.7\n');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from('isom')]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // executable — must NOT be recognized as media
const junk = Buffer.from([0x00, 0x01, 0x02, 0x03]);

describe('detectFileType (magic bytes)', () => {
  it.each([
    ['jpeg', jpeg, 'image/jpeg', 'image'],
    ['png', png, 'image/png', 'image'],
    ['gif', gif, 'image/gif', 'image'],
    ['webp', webp, 'image/webp', 'image'],
    ['pdf', pdf, 'application/pdf', 'pdf'],
    ['mp4', mp4, 'video/mp4', 'video'],
    ['webm', webm, 'video/webm', 'video'],
  ])('detects %s', (_n, buf, type, group) => {
    expect(detectFileType(buf)).toEqual({ type, group });
    expect(detectMimeGroup(buf)).toBe(group);
  });

  it('returns null for an executable (spoofed media)', () => {
    expect(detectFileType(elf)).toBeNull();
    expect(detectMimeGroup(elf)).toBeNull();
  });

  it('returns null for unrecognized / too-short data', () => {
    expect(detectFileType(junk)).toBeNull();
    expect(detectFileType(Buffer.from([0x01]))).toBeNull();
  });
});

describe('ClamAV hook (disabled by default)', () => {
  it('is a no-op skip when CLAMAV_ENABLED is false', async () => {
    const res = await scanBuffer(jpeg);
    expect(res).toEqual({ clean: true, skipped: true });
  });
});

describe('confirmUpload', () => {
  it('reports storage unavailable when S3 is not configured (test env)', async () => {
    await expect(confirmUpload('u1', 'uploads/avatars/u1/abc.jpg')).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
      statusCode: 503,
    });
  });
});
