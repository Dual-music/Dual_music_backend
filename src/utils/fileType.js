/**
 * @file Magic-byte file-type detection.
 *
 * Inspects the leading bytes of a file to determine its true MIME group,
 * independent of the client-declared `Content-Type` (which can be spoofed).
 * Used by the post-upload confirmation step to reject files whose real content
 * does not match the upload category (e.g. an executable renamed `.jpg`).
 *
 * @module utils/fileType
 */

/** ASCII-compare bytes at `offset` against a string. */
function matchAscii(buf, offset, str) {
  if (buf.length < offset + str.length) return false;
  for (let i = 0; i < str.length; i += 1) {
    if (buf[offset + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}

/** Compare a leading byte sequence. */
function matchBytes(buf, bytes) {
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Detects the concrete file type from a buffer's magic bytes.
 * @param {Buffer} buf - At least the first ~16 bytes of the file.
 * @returns {{ type: string, group: 'image'|'video'|'pdf'|'audio' } | null} `null` if unrecognized.
 */
export function detectFileType(buf) {
  if (!buf || buf.length < 4) return null;

  // Images
  if (matchBytes(buf, [0xff, 0xd8, 0xff])) return { type: 'image/jpeg', group: 'image' };
  if (matchBytes(buf, [0x89, 0x50, 0x4e, 0x47])) return { type: 'image/png', group: 'image' };
  if (matchAscii(buf, 0, 'GIF8')) return { type: 'image/gif', group: 'image' };
  if (matchBytes(buf, [0x42, 0x4d])) return { type: 'image/bmp', group: 'image' };
  if (matchAscii(buf, 0, 'RIFF') && matchAscii(buf, 8, 'WEBP')) return { type: 'image/webp', group: 'image' };

  // Documents
  if (matchAscii(buf, 0, '%PDF')) return { type: 'application/pdf', group: 'pdf' };

  // Audio — checked BEFORE the generic MP4 container signature below, since an M4A audio
  // file shares the exact same `ftyp` box at offset 4 (only the brand that follows differs:
  // "M4A " for audio vs. "isom"/"mp42"/... for video) and would otherwise be misdetected.
  if (matchAscii(buf, 0, 'ID3')) return { type: 'audio/mpeg', group: 'audio' };
  // MP3 frame sync (no ID3 tag): 0xFFEx/0xFFFx with the MPEG-audio bits set.
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0x00) return { type: 'audio/mpeg', group: 'audio' };
  if (matchAscii(buf, 0, 'RIFF') && matchAscii(buf, 8, 'WAVE')) return { type: 'audio/wav', group: 'audio' };
  if (matchAscii(buf, 0, 'OggS')) return { type: 'audio/ogg', group: 'audio' };
  if (matchBytes(buf, [0x66, 0x4c, 0x61, 0x43])) return { type: 'audio/flac', group: 'audio' };
  if (matchAscii(buf, 4, 'ftypM4A')) return { type: 'audio/mp4', group: 'audio' };

  // Video / containers
  if (matchBytes(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { type: 'video/webm', group: 'video' };
  if (matchAscii(buf, 4, 'ftyp')) return { type: 'video/mp4', group: 'video' };
  if (matchAscii(buf, 0, 'RIFF') && matchAscii(buf, 8, 'AVI ')) return { type: 'video/x-msvideo', group: 'video' };

  return null;
}

/**
 * Returns the MIME group of a buffer, or `null`.
 * @param {Buffer} buf
 * @returns {'image'|'video'|'pdf'|'audio'|null}
 */
export function detectMimeGroup(buf) {
  return detectFileType(buf)?.group ?? null;
}

export default { detectFileType, detectMimeGroup };
