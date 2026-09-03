import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const hostPath = resolve(import.meta.dirname, '..', 'native', '.build', 'release', 'ClipboardPlusNativeHost');
const dataDirectory = await mkdtemp(join(tmpdir(), 'clipboard-plus-host-check-'));

async function request(message) {
  const child = spawn(hostPath, [], {
    env: { ...process.env, CLIPBOARD_PLUS_DATA_DIR: dataDirectory },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const payload = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  child.stdin.end(Buffer.concat([header, payload]));

  const chunks = [];
  for await (const chunk of child.stdout) chunks.push(chunk);
  const responseBuffer = Buffer.concat(chunks);
  const responseLength = responseBuffer.readUInt32LE(0);
  return JSON.parse(responseBuffer.subarray(4, 4 + responseLength).toString('utf8'));
}

try {
  const pending = await request({ action: 'getPending' });
  if (!pending.ok || !Array.isArray(pending.clips) || pending.clips.length !== 0) {
    throw new Error(`Unexpected pending response: ${JSON.stringify(pending)}`);
  }

  const clip = {
    id: 'palette-test',
    type: 'text',
    content: 'Quick Paste test',
    sourceApp: 'Tests',
    favorite: true,
    createdAt: 1,
    updatedAt: 2,
  };
  const replacement = await request({ action: 'replaceHistory', clips: [clip] });
  if (!replacement.ok) throw new Error(`History replacement failed: ${JSON.stringify(replacement)}`);

  const history = await request({ action: 'getHistory' });
  if (!history.ok || history.clips?.length !== 1 || history.clips[0].content !== clip.content) {
    throw new Error(`Unexpected history response: ${JSON.stringify(history)}`);
  }
  console.log('Clipboard+ Native Messaging framing and Quick Paste history checks passed.');
} finally {
  await rm(dataDirectory, { recursive: true, force: true });
}
