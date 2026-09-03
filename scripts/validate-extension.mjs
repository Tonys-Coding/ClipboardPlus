import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(import.meta.dirname, '..', 'dist');
const manifest = JSON.parse(await readFile(resolve(outputDirectory, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) {
  throw new Error('The generated extension is not Manifest V3.');
}

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
];

await Promise.all(referencedFiles.map((file) => stat(resolve(outputDirectory, file))));

for (const script of manifest.content_scripts.flatMap((entry) => entry.js)) {
  const source = await readFile(resolve(outputDirectory, script), 'utf8');
  if (/^\s*(?:import|export)\s/m.test(source)) {
    throw new Error(`${script} contains ES-module syntax, which Chrome content scripts cannot execute.`);
  }
}

console.log(`Extension validation passed for ${referencedFiles.length} referenced files and classic content-script syntax.`);
