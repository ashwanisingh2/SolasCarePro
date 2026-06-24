/**
 * Shared utility formatters for Solas Care Pro application.
 */

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
 * Converts ISO date string into human-readable date.
 * @param {string} isoString - Date ISO string
 * @returns {string} Formatted date (e.g. "Jun 24, 2026, 11:39 AM")
 */
export function formatDate(isoString) {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return 'N/A';
  }
}

/**
 * Converts seconds into a human-readable duration like "2h 30m 15s" or "45s".
 * @param {number} seconds - Number of seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
