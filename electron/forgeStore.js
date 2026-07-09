// electron/forgeStore.js
// Catalog + role presets for the Software Forge (Feature 4).
//
// Catalog = curated list of essential apps installable via Winget.
// Role presets = pre-ticked app sets for Developer / Student / Creator.
//
// Catalog uses real Winget IDs that exist in the winget repository.

const fs = require('fs');
const path = require('path');

// --- Catalog ---
// Each app: { id (winget id), name, category, description, icon, popular }

const FORGE_CATALOG = [
  // Browsers
  { id: 'Google.Chrome',            name: 'Google Chrome',          category: 'browser',    description: 'Fast, secure browser',                  icon: 'globe',     popular: true },
  { id: 'Mozilla.Firefox',          name: 'Mozilla Firefox',        category: 'browser',    description: 'Privacy-first browser',                 icon: 'globe',     popular: true },
  { id: 'Brave.Brave',              name: 'Brave Browser',          category: 'browser',    description: 'Ad-blocking browser',                    icon: 'shield',    popular: false },
  { id: 'Microsoft.Edge',           name: 'Microsoft Edge',         category: 'browser',    description: 'Chromium-based, built-in',               icon: 'globe',     popular: false },

  // Dev tools
  { id: 'Microsoft.VisualStudioCode', name: 'VS Code',              category: 'dev',        description: 'Code editor',                            icon: 'code',      popular: true },
  { id: 'Git.Git',                  name: 'Git',                    category: 'dev',        description: 'Version control',                        icon: 'git',       popular: true },
  { id: 'OpenJS.NodeJS.LTS',        name: 'Node.js LTS',            category: 'dev',        description: 'JavaScript runtime',                     icon: 'code',      popular: true },
  { id: 'Python.Python.3.12',       name: 'Python 3.12',            category: 'dev',        description: 'Python runtime',                         icon: 'code',      popular: true },
  { id: 'Postman.Postman',          name: 'Postman',                category: 'dev',        description: 'API testing',                            icon: 'code',      popular: true },
  { id: 'Docker.DockerDesktop',     name: 'Docker Desktop',         category: 'dev',        description: 'Container runtime',                      icon: 'code',      popular: false },
  { id: 'Microsoft.PowerShell',     name: 'PowerShell 7',           category: 'dev',        description: 'Modern shell',                           icon: 'terminal',  popular: false },
  { id: 'JetBrains.IntelliJIDEA.Community', name: 'IntelliJ IDEA Community', category: 'dev', description: 'Java IDE',                       icon: 'code',      popular: false },
  { id: 'GoLang.Go',                name: 'Go',                     category: 'dev',        description: 'Go language',                            icon: 'code',      popular: false },
  { id: 'Rustlang.Rustup',          name: 'Rust',                   category: 'dev',        description: 'Rust toolchain',                         icon: 'code',      popular: false },

  // Communication
  { id: 'Microsoft.Teams',          name: 'Microsoft Teams',        category: 'comm',       description: 'Work chat & meetings',                   icon: 'message',   popular: true },
  { id: 'Discord.Discord',          name: 'Discord',                category: 'comm',       description: 'Community chat',                         icon: 'message',   popular: true },
  { id: 'SlackTechnologies.Slack',  name: 'Slack',                  category: 'comm',       description: 'Work chat',                              icon: 'message',   popular: false },
  { id: 'Zoom.Zoom',                name: 'Zoom',                   category: 'comm',       description: 'Video conferencing',                     icon: 'video',     popular: true },

  // Media
  { id: 'VideoLAN.VLC',             name: 'VLC Media Player',       category: 'media',      description: 'Plays everything',                       icon: 'video',     popular: true },
  { id: 'OBSProject.OBSStudio',     name: 'OBS Studio',             category: 'media',      description: 'Streaming & recording',                  icon: 'video',     popular: true },
  { id: 'Audacity.Audacity',        name: 'Audacity',               category: 'media',      description: 'Audio editor',                           icon: 'audio',     popular: false },
  { id: 'GIMP.GIMP',                name: 'GIMP',                   category: 'media',      description: 'Image editor',                           icon: 'image',     popular: false },
  { id: 'Daum.PotPlayer',           name: 'PotPlayer',              category: 'media',      description: 'Lightweight media player',               icon: 'video',     popular: false },

  // Utilities
  { id: '7zip.7zip',                name: '7-Zip',                  category: 'utility',    description: 'Archive tool',                           icon: 'archive',   popular: true },
  { id: 'Microsoft.PowerToys',      name: 'PowerToys',              category: 'utility',    description: 'Power user utilities',                   icon: 'zap',       popular: true },
  { id: 'voidtools.Everything',     name: 'Everything Search',      category: 'utility',    description: 'Instant file search',                    icon: 'search',    popular: true },
  { id: 'ShareX.ShareX',            name: 'ShareX',                 category: 'utility',    description: 'Screenshot & screen recording',          icon: 'image',     popular: false },
  { id: 'Notepad++.Notepad++',      name: 'Notepad++',              category: 'utility',    description: 'Fast text editor',                       icon: 'file',      popular: true },

  // Office
  { id: 'TheDocumentFoundation.LibreOffice', name: 'LibreOffice',   category: 'office',     description: 'Free office suite',                      icon: 'file',      popular: false },
  { id: 'OBSProject.OBSStudio',     name: 'OBS Studio (dup)',       category: 'office',     description: '',                                       icon: 'video',     popular: false }
].filter((app, idx, arr) => arr.findIndex(a => a.id === app.id) === idx);  // dedupe by id

// --- Role presets ---
// Used by "Fresh Windows Kit" wizard. Each preset pre-selects apps.

const ROLE_PRESETS = [
  {
    id: 'developer',
    name: 'Developer',
    description: 'Code, build, and ship software',
    icon: 'code', color: 'cyan',
    appIds: ['Microsoft.VisualStudioCode', 'Git.Git', 'OpenJS.NodeJS.LTS', 'Python.Python.3.12',
             'Postman.Postman', 'Microsoft.PowerShell', '7zip.7zip', 'voidtools.Everything',
             'Microsoft.PowerToys', 'Notepad++.Notepad++']
  },
  {
    id: 'student',
    name: 'Student',
    description: 'Study, take notes, attend class',
    icon: 'book', color: 'amber',
    appIds: ['Microsoft.Edge', 'Zoom.Zoom', 'Microsoft.Teams', 'VideoLAN.VLC',
             '7zip.7zip', 'Notepad++.Notepad++', 'voidtools.Everything']
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'Stream, edit, and publish content',
    icon: 'video', color: 'rose',
    appIds: ['OBSProject.OBSStudio', 'VideoLAN.VLC', 'GIMP.GIMP', 'Audacity.Audacity',
             'ShareX.ShareX', 'Google.Chrome', 'Microsoft.PowerToys']
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just the bare essentials',
    icon: 'zap', color: 'violet',
    appIds: ['Google.Chrome', '7zip.7zip', 'VideoLAN.VLC', 'voidtools.Everything']
  }
];

// --- Storage paths ---
let root = null;
let customCatalogsFile = null;

function initForgeStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'forge');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  customCatalogsFile = path.join(root, 'custom_catalogs.json');
}

function ensureInit() { if (!root) initForgeStore(); }

function getCatalog() { return FORGE_CATALOG; }
function getRolePresets() { return ROLE_PRESETS; }

function listCustomCatalogs() {
  ensureInit();
  if (!fs.existsSync(customCatalogsFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(customCatalogsFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

function saveCustomCatalog(catalog) {
  ensureInit();
  if (!catalog || typeof catalog !== 'object') throw new Error('Invalid catalog');
  if (typeof catalog.id !== 'string' || !/^fc_[A-Za-z0-9_\-]+$/.test(catalog.id)) {
    throw new Error('Invalid catalog id (must match fc_<alphanum>)');
  }
  if (typeof catalog.name !== 'string' || catalog.name.length === 0 || catalog.name.length > 100) {
    throw new Error('Catalog name must be 1-100 chars');
  }
  if (!Array.isArray(catalog.apps)) throw new Error('Catalog apps must be array');
  // Validate each app: must have valid winget-style id
  for (const app of catalog.apps) {
    if (typeof app !== 'object' || typeof app.id !== 'string' || !/^[A-Za-z0-9\.\-_@]{1,200}$/.test(app.id)) {
      throw new Error(`Invalid app id in catalog: ${app?.id}`);
    }
    if (typeof app.name !== 'string' || app.name.length > 200) {
      throw new Error('App name invalid');
    }
  }
  const all = listCustomCatalogs();
  const idx = all.findIndex(c => c.id === catalog.id);
  if (idx >= 0) all[idx] = catalog; else all.push(catalog);
  fs.writeFileSync(customCatalogsFile, JSON.stringify(all, null, 2), 'utf8');
  return catalog;
}

function deleteCustomCatalog(id) {
  if (!/^fc_[A-Za-z0-9_\-]+$/.test(id)) throw new Error('Invalid catalog id');
  const all = listCustomCatalogs();
  const filtered = all.filter(c => c.id !== id);
  ensureInit();
  fs.writeFileSync(customCatalogsFile, JSON.stringify(filtered, null, 2), 'utf8');
  return all.length !== filtered.length;
}

module.exports = {
  initForgeStore,
  getCatalog,
  getRolePresets,
  listCustomCatalogs,
  saveCustomCatalog,
  deleteCustomCatalog
};
