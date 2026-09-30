import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, sep } from 'node:path';
const authorizedProjectRoot = realpathSync(new URL('../', import.meta.url));

// A guard for project-owned tools; this does not claim to sandbox the OS.
export function assertProjectWritePath(projectRoot, inputPath) {
  const root = realpathSync(projectRoot);
  if (root !== authorizedProjectRoot) throw new Error('outside_authorized_project');
  const target = resolve(root, inputPath);
  function inside(path) {
    const rel = relative(root, path);
    return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
  }
  if (!inside(target)) throw new Error('outside_authorized_project');
  let existing = target;
  while (!existsSync(existing)) existing = dirname(existing);
  if (!inside(realpathSync(existing))) throw new Error('outside_authorized_project');
  return target;
}

export function readSourceManifest(projectRoot) {
  const path = assertProjectWritePath(projectRoot, 'docs/review/source-manifest.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}
