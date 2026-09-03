import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const hostPath = resolve(import.meta.dirname, '..', 'native', '.build', 'release', 'ClipboardPlusNativeHost');
const dataDirectory = await mkdtemp(join(tmpdir(), 'clipboard-plus-host-check-'));
const child = spawn(hostPath, [], {
  env: { ...process.env, CLIPBOARD_PLUS_DATA_DIR: dataDirectory },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const payload = Buffer.from(JSON.stringify({ action: 'getPending' }));
const header = Buffer.alloc(4);
header.writeUInt32LE(payload.length);
child.stdin.end(Buffer.concat([header, payload]));

const chunks = [];
for await (const chunk of child.stdout) chunks.push(chunk);
const responseBuffer = Buffer.concat(chunks);
const responseLength = responseBuffer.readUInt32LE(0);
const response = JSON.parse(responseBuffer.subarray(4, 4 + responseLength).toString('utf8'));
await rm(dataDirectory, { recursive: true, force: true });

if (!response.ok || !Array.isArray(response.clips) || response.clips.length !== 0) {
  throw new Error(`Unexpected native host response: ${JSON.stringify(response)}`);
}
console.log('Clipboard+ Native Messaging framing check passed.');
