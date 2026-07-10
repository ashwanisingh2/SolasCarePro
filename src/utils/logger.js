/**
 * Production-safe logging utility
 * Automatically strips console statements in production builds
 */

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args) => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  
  error: (...args) => {
    if (isDev) {
      console.error(...args);
    }
    // In production, you could send to error tracking service like Sentry
    // if (!isDev) {
    //   sendToErrorTracker(args);
    // }
  },
  
  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  }
};

// For backwards compatibility, also export individual functions
export const log = logger.log;
export const warn = logger.warn;
export const error = logger.error;
export const info = logger.info;
