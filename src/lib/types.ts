export type ClipType = 'text' | 'url';

export interface Clip {
  id: string;
  type: ClipType;
  content: string;
  title?: string;
  sourceUrl?: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  autoCapture: boolean;
  historyLimit: number;
  excludedSites: string[];
}

export interface StorageState {
  version: 1;
  clips: Clip[];
  settings: Settings;
}

export type AddClipInput = Pick<Clip, 'content'> & Partial<Pick<Clip, 'id' | 'title' | 'sourceUrl'>>;

export type RuntimeMessage =
  | { type: 'GET_STATE' }
  | { type: 'ADD_CLIP'; payload: AddClipInput }
  | { type: 'UPDATE_CLIP'; payload: { id: string; content: string; title?: string } }
  | { type: 'TOGGLE_FAVORITE'; payload: { id: string } }
  | { type: 'DELETE_CLIP'; payload: { id: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'CLEAR_ALL' };

export interface RuntimeResponse {
  ok: boolean;
  state?: StorageState;
  error?: string;
}
