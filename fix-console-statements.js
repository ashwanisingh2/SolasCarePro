/**
 * Script to wrap all console statements with DEV mode checks
 * Run: node fix-console-statements.js
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/components/StartupManager.jsx',
  'src/components/SoftwareUpdater.jsx',
  'src/components/UnifiedDashboard.jsx',
  'src/components/Settings.jsx',
  'src/components/ServiceManager.jsx',
  'src/components/RegistryManager.jsx',
  'src/components/PrivacyCleaner.jsx',
  'src/components/PerformanceTuning.jsx',
  'src/components/NetworkMonitor.jsx',
  'src/components/HistoryLogs.jsx',
  'src/components/HardwareDiagnostics.jsx',
  'src/components/ErrorBoundary.jsx',
  'src/components/DeviceDetails.jsx',
  'src/components/DriverManager.jsx',
  'src/components/CommandHub.jsx',
  'src/components/BsodAnalyzer.jsx',
  'src/components/BrowserRepair.jsx',
  'src/components/AiDiagnostics.jsx',
  'src/App.jsx',
  'src/context/SystemMetricsContext.jsx'
];

function wrapConsoleStatements(content) {
  // Pattern 1: console.error/warn/log in catch blocks
  content = content.replace(
    /(\s+)(console\.(error|warn|log)\([^;]+\);)/g,
    (match, indent, statement) => {
      return `${indent}if (import.meta.env.DEV) {\n${indent}  ${statement}\n${indent}}`;
    }
  );
  
  // Pattern 2: standalone console statements (not in if blocks already)
  content = content.replace(
    /^(\s+)(console\.(error|warn|log)\([^;]+\);)$/gm,
    (match, indent, statement) => {
      // Don't wrap if already wrapped
      if (content.includes(`if (import.meta.env.DEV) {\n${indent}  ${statement}`)) {
        return match;
      }
      return `${indent}if (import.meta.env.DEV) {\n${indent}  ${statement}\n${indent}}`;
    }
  );
  
  return content;
}

function fixFile(filePath) {
  try {
    const fullPath = path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  Skipping ${filePath} (not found)`);
      return;
    }
    
    let content = fs.readFileSync(fullPath, 'utf8');
    const originalContent = content;
    
    content = wrapConsoleStatements(content);
    
    if (content !== originalContent) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`✅ Fixed ${filePath}`);
    } else {
      console.log(`⏭️  No changes needed in ${filePath}`);
    }
  } catch (err) {
    console.error(`❌ Error fixing ${filePath}:`, err.message);
  }
}

console.log('🔧 Starting console statement fixes...\n');

filesToFix.forEach(fixFile);

console.log('\n✨ Console statement fixes complete!');
console.log('\n📝 Note: Review the changes and test the app before committing.');
