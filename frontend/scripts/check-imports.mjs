// Static verification: resolves every "@/..." import in the project to a real file,
// and checks that named exports referenced actually exist in the target module.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['app', 'components', 'context', 'lib', 'data', 'hooks'];

const walk = (dir, files = []) => {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
};

// Strip block/line comments and template literals roughly, then pull out import specifiers
const IMPORT_RE = /import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

let errors = 0;
let checked = 0;
let importCount = 0;

const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

for (const dir of SRC_DIRS) {
  for (const file of walk(path.join(root, dir))) {
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = [
      ...[...source.matchAll(IMPORT_RE)].map((m) => ({ spec: m[2], clause: m[1] || '' })),
      ...[...source.matchAll(DYNAMIC_RE)].map((m) => ({ spec: m[1], clause: '' })),
    ];

    for (const { spec, clause } of specifiers) {
      if (!spec.startsWith('@/') && !spec.startsWith('.')) continue;
      importCount += 1;
      checked += 1;

      const basePath = spec.startsWith('@/')
        ? path.join(root, spec.slice(2))
        : path.resolve(path.dirname(file), spec);

      const candidates = [
        basePath,
        `${basePath}.js`,
        `${basePath}.mjs`,
        path.join(basePath, 'index.js'),
      ];

      if (!candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile())) {
        errors += 1;
        console.log(`UNRESOLVED  ${rel(file)}  ->  ${spec}`);
        continue;
      }

      // Verify named imports exist in the target module
      const resolved = candidates.find(
        (c) => fs.existsSync(c) && fs.statSync(c).isFile()
      );
      const target = fs.readFileSync(resolved, 'utf8');

      const namedMatch = clause.match(/\{([\s\S]*?)\}/);
      if (namedMatch) {
        const names = namedMatch[1]
          .split(',')
          .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);

        for (const name of names) {
          if (!name) continue;
          const patterns = [
            new RegExp(`export\\s+(const|let|var|function|class|async function)\\s+${name}\\b`),
            new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`),
          ];
          if (!patterns.some((re) => re.test(target))) {
            errors += 1;
            console.log(`MISSING EXPORT  ${rel(file)}  ->  "${name}" not exported by ${spec}`);
          }
        }
      }
    }
  }
}

console.log(
  `\nChecked ${importCount} import(s) across ${checked} file reference(s). ${
    errors === 0 ? 'No problems found.' : `${errors} problem(s) found.`
  }`
);
process.exit(errors === 0 ? 0 : 1);