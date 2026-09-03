import type { RuntimeMessage, RuntimeResponse } from './types';

export async function sendMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse | undefined;
  if (!response) throw new Error('Clipboard+ background service is unavailable.');
  if (!response.ok) throw new Error(response.error || 'Clipboard+ could not complete that action.');
  return response;
}
