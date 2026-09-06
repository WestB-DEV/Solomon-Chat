import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Commit the reviewed candidate before packaging.');
const readJson = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const manifest = readJson('manifest.json');
const lock = readJson('package-lock.json');
if (manifest.version !== readJson('package.json').version
  || manifest.version !== lock.version || manifest.version !== lock.packages[''].version
  || readJson('versions.json')[manifest.version] !== manifest.minAppVersion) {
  throw new Error('Release versions disagree.');
}
if (!process.argv[2]) throw new Error('Provide an output parent directory outside the repository.');
const commit = git('rev-parse', 'HEAD');
const destination = path.resolve(process.argv[2], `solomon-chat-${manifest.version}-rc2-${commit.slice(0, 7)}`);
const relative = path.relative(root, destination);
if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error('Output must be outside repository.');
mkdirSync(destination); // Never overwrite an existing candidate.
const sources = ['main.js', 'manifest.json', 'styles.css', 'docs/releases/1.2.0-rc2.md', 'docs/testing/beta-closeout-20260906.md'];
const files = sources.map((source) => {
  const name = path.basename(source);
  const data = readFileSync(path.join(root, source));
  copyFileSync(path.join(root, source), path.join(destination, name));
  return { name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
});
writeFileSync(path.join(destination, 'candidate.json'), JSON.stringify({
  version: manifest.version, channel: 'private-rc2', commit, branch: git('branch', '--show-current'),
  createdAt: new Date().toISOString(), publicRelease: false, files,
}, null, 2) + '\n');
process.stdout.write(destination + '\n');
