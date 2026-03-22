import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const distDir = path.join(projectRoot, 'dist');

const forbiddenPatterns = [
  /editorBootstrap/i,
  /TransformControls/i,
  /mine-duel-dev-editor/i,
  /mountEditor/i,
  /VITE_ENABLE_EDITOR/i
];

function walkFiles(dirPath, list = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, list);
      continue;
    }

    list.push(absolutePath);
  }

  return list;
}

if (!fs.existsSync(distDir)) {
  console.error('Build verification failed: dist directory does not exist. Run build first.');
  process.exit(1);
}

const distFiles = walkFiles(distDir);
const flagged = [];

for (const absolutePath of distFiles) {
  const relativePath = path.relative(projectRoot, absolutePath);

  if (/editor/i.test(relativePath)) {
    flagged.push({ file: relativePath, reason: 'forbidden filename path contains "editor"' });
    continue;
  }

  if (!/\.(js|html|css|txt)$/i.test(absolutePath)) {
    continue;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (!pattern.test(content)) {
      continue;
    }

    flagged.push({ file: relativePath, reason: `pattern match ${pattern}` });
    break;
  }
}

if (flagged.length > 0) {
  console.error('Build verification failed: editor artifacts detected in dist output.');
  for (const finding of flagged) {
    console.error(` - ${finding.file}: ${finding.reason}`);
  }
  process.exit(1);
}

console.log('Build verification passed: no editor artifacts found in dist output.');
