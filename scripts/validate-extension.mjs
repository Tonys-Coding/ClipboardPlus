import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const profile = process.argv[2] ?? 'development';
if (!['development', 'store'].includes(profile)) throw new Error(`Unknown validation profile: ${profile}`);

const outputDirectory = resolve(import.meta.dirname, '..', 'dist');
const manifest = JSON.parse(await readFile(resolve(outputDirectory, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('The generated extension is not Manifest V3.');
if (manifest.version !== '1.6.1') throw new Error(`Expected extension version 1.6.1, received ${manifest.version}.`);
if (profile === 'store' && manifest.host_permissions?.length) throw new Error('Website access must not be a required store permission.');
if (manifest.content_scripts?.length) throw new Error('Automatic capture must be registered only after consent.');

const expectedOrigins = ['http://*/*', 'https://*/*'];
if (JSON.stringify(manifest.optional_host_permissions) !== JSON.stringify(expectedOrigins)) {
  throw new Error('The optional website capture origins are incorrect.');
}

const hasNativePermission = manifest.permissions.includes('nativeMessaging');
if (profile === 'store' && hasNativePermission) throw new Error('The store build must not request Native Messaging.');
if (profile === 'development' && !hasNativePermission) throw new Error('The development build is missing Native Messaging.');
if (profile === 'development' && JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedOrigins)) {
  throw new Error('The development profile must pre-authorize test websites.');
}

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  'content.js',
  'fonts/Satoshi-Variable.woff2',
  'fonts/Satoshi-FFL.txt',
  'icons/clipboard-plus-logo.png',
  'icons/type-code.png',
  'icons/type-text.png',
  'icons/type-url.png',
];

await Promise.all(referencedFiles.map((file) => stat(resolve(outputDirectory, file))));

const contentSource = await readFile(resolve(outputDirectory, 'content.js'), 'utf8');
if (/^\s*(?:import|export)\s/m.test(contentSource)) {
  throw new Error('content.js contains ES-module syntax, which Chrome content scripts cannot execute.');
}

const backgroundSource = await readFile(resolve(outputDirectory, manifest.background.service_worker), 'utf8');
if (profile === 'store' && /sendNativeMessage|com\.clipboardplus\.native/.test(backgroundSource)) {
  throw new Error('The store background bundle still contains companion integration.');
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(resolve(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

const outputFiles = await listFiles(outputDirectory);
if (outputFiles.some((file) => file.endsWith('.map'))) throw new Error('Source maps must not be included in extension builds.');
if (profile === 'store' && outputFiles.some((file) => /native|installer|companion/i.test(file))) {
  throw new Error('The store build contains native companion artifacts.');
}

console.log(`${profile} extension validation passed for ${referencedFiles.length} referenced files and ${outputFiles.length} packaged files.`);
