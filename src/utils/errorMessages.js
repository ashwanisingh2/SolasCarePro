/**
 * User-friendly error message mapper
 * Converts technical errors into actionable user messages
 */

export function getUserFriendlyError(error, context = '') {
  const message = error?.message || error || 'Unknown error';
  const lowerMessage = message.toLowerCase();
  
  // Network/API errors
  if (lowerMessage.includes('fetch') || lowerMessage.includes('network')) {
    return {
      title: 'Connection Error',
      message: 'Unable to connect. Please check your internet connection and try again.',
      action: 'Retry'
    };
  }
  
  // Permission errors
  if (lowerMessage.includes('access denied') || lowerMessage.includes('permission') || lowerMessage.includes('unauthorized')) {
    return {
      title: 'Permission Denied',
      message: 'Administrator privileges required. Please run SolasCare as Administrator and try again.',
      action: 'Restart as Admin'
    };
  }
  
  // File system errors
  if (lowerMessage.includes('file not found') || lowerMessage.includes('enoent')) {
    return {
      title: 'File Not Found',
      message: `The required file could not be found. ${context ? `Context: ${context}` : 'Please reinstall the application.'}`,
      action: 'Reinstall'
    };
  }
  
  // PowerShell execution errors
  if (lowerMessage.includes('powershell') || lowerMessage.includes('execution policy')) {
    return {
      title: 'Script Execution Blocked',
      message: 'PowerShell execution policy is blocking the operation. Check Windows security settings.',
      action: 'Open Settings'
    };
  }
  
  // Driver errors
  if (context === 'driver' && (lowerMessage.includes('failed') || lowerMessage.includes('error'))) {
    return {
      title: 'Driver Operation Failed',
      message: 'Unable to complete driver operation. This may be due to Windows Update restrictions or driver signature issues.',
      action: 'View Logs'
    };
  }
  
  // Registry errors
  if (context === 'registry') {
    return {
      title: 'Registry Operation Failed',
      message: 'Unable to modify registry. Ensure no antivirus is blocking the operation and you have admin rights.',
      action: 'Check Permissions'
    };
  }
  
  // Service errors
  if (context === 'service') {
    return {
      title: 'Service Operation Failed',
      message: 'Unable to modify Windows service. The service may be protected or require special permissions.',
      action: 'View Details'
    };
  }
  
  // Timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return {
      title: 'Operation Timed Out',
      message: 'The operation took too long to complete. Your system may be under heavy load.',
      action: 'Retry'
    };
  }
  
  // Disk space errors
  if (lowerMessage.includes('disk') || lowerMessage.includes('space') || lowerMessage.includes('enospc')) {
    return {
      title: 'Insufficient Disk Space',
      message: 'Not enough disk space to complete the operation. Free up space and try again.',
      action: 'Run Disk Cleanup'
    };
  }
  
  // Generic fallback
  return {
    title: 'Operation Failed',
    message: message.length > 100 ? message.substring(0, 100) + '...' : message,
    action: 'Retry'
  };
}

/**
 * Format error for notification system
 */
export function formatErrorNotification(error, context = '') {
  const friendly = getUserFriendlyError(error, context);
  return {
    title: friendly.title,
    message: friendly.message,
    type: 'error',
    action: friendly.action
  };
}

/**
 * Common error handlers by category
 */
export const ErrorHandlers = {
  driver: (error, addNotification) => {
    const { title, message } = getUserFriendlyError(error, 'driver');
    addNotification(title, message, 'error');
  },
  
  registry: (error, addNotification) => {
    const { title, message } = getUserFriendlyError(error, 'registry');
    addNotification(title, message, 'error');
  },
  
  service: (error, addNotification) => {
    const { title, message } = getUserFriendlyError(error, 'service');
    addNotification(title, message, 'error');
  },
  
  network: (error, addNotification) => {
    const { title, message } = getUserFriendlyError(error, 'network');
    addNotification(title, message, 'error');
  },
  
  generic: (error, addNotification, customContext = '') => {
    const { title, message } = getUserFriendlyError(error, customContext);
    addNotification(title, message, 'error');
  }
};
