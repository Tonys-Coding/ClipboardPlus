import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(root, 'artifacts');
const archive = resolve(outputDirectory, 'clipboard-plus-v1.8.3-store.zip');

await mkdir(outputDirectory, { recursive: true });
await rm(archive, { force: true });
await run('zip', ['-X', '-q', '-r', archive, '.'], { cwd: resolve(root, 'dist-store') });
await run('unzip', ['-t', archive]);
console.log(archive);
