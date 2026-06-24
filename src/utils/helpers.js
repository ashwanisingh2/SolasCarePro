/**
 * Common formatting helper functions used across the application components.
 */

/**
 * Formats a raw number of bytes per second into human-readable network speed.
 * @param {number} bytesPerSec - Raw speed in bytes per second
 * @returns {string} Formatted speed string (e.g. "1.2 MB/s")
 */
export function formatBytesPerSec(bytesPerSec) {
  if (bytesPerSec === undefined || bytesPerSec === null || isNaN(bytesPerSec)) return '0 B/s';
  const val = Number(bytesPerSec);
  if (val < 1024) return `${val.toFixed(0)} B/s`;
  if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB/s`;
  if (val < 1024 * 1024 * 1024) return `${(val / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(val / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

/**
 * Formats a raw file size in bytes into human-readable size.
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string (e.g. "4.5 GB")
 */
export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  const val = Number(bytes);
  if (val === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(val) / Math.log(k));
  const cleanIndex = Math.min(i, sizes.length - 1);
  return `${(val / Math.pow(k, cleanIndex)).toFixed(1)} ${sizes[cleanIndex]}`;
}
