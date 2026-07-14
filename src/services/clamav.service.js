import net from 'node:net';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * @file Optional ClamAV antivirus hook (clamd `INSTREAM` over TCP).
 *
 * When `CLAMAV_ENABLED=true`, buffers are streamed to a `clamd` daemon for
 * scanning during post-upload confirmation. When disabled (default) the scan is
 * a no-op (`skipped: true`). On scanner error/timeout the hook **fails open**
 * (upload allowed, warning logged) so antivirus infra outages never block the
 * product — the antivirus is an optional defense-in-depth layer, per spec.
 *
 * @module services/clamav.service
 */

/**
 * Scans a buffer for malware via clamd INSTREAM.
 * @param {Buffer} buffer
 * @returns {Promise<{ clean: boolean, skipped?: boolean, signature?: string, error?: string }>}
 */
export function scanBuffer(buffer) {
  const { enabled, host, port, timeoutMs } = config.clamav;
  if (!enabled) return Promise.resolve({ clean: true, skipped: true });

  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    let response = '';

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      // clamd INSTREAM: repeated <4-byte BE length><chunk>, terminated by a zero-length chunk.
      const size = Buffer.alloc(4);
      size.writeUInt32BE(buffer.length, 0);
      socket.write(size);
      socket.write(buffer);
      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });
    socket.on('end', () => {
      const infected = /FOUND\b/.test(response);
      const signature = /:\s*(.+?)\s+FOUND/.exec(response)?.[1];
      done({ clean: !infected, signature });
    });
    socket.on('timeout', () => {
      logger.warn('ClamAV scan timed out — failing open');
      done({ clean: true, skipped: true, error: 'timeout' });
    });
    socket.on('error', (err) => {
      logger.warn({ err: err.message }, 'ClamAV unavailable — failing open');
      done({ clean: true, skipped: true, error: err.message });
    });
  });
}

export default { scanBuffer };
