export type ClipType = 'text' | 'url' | 'code';
export type RetentionDays = 0 | 1 | 7 | 30 | 90;

export interface Clip {
  id: string;
  type: ClipType;
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  theme: 'light' | 'dark';
  autoCapture: boolean;
  historyLimit: number;
  retentionDays: RetentionDays;
  excludedSites: string[];
  captureTypes: ClipType[];
  capturePaused: boolean;
  capturePausedUntil: number | null;
  capturePageTitle: boolean;
  captureSourceUrl: boolean;
  captureSourceApp: boolean;
  captureConsentVersion: number;
  captureConsentAt?: number;
}

export interface StorageState {
  version: 2;
  clips: Clip[];
  settings: Settings;
}

export type AddClipInput = Pick<Clip, 'content'> & Partial<Pick<Clip, 'id' | 'title' | 'sourceUrl' | 'sourceApp'>>;

export type RuntimeMessage =
  | { type: 'GET_STATE' }
  | { type: 'SYNC_COMPANION' }
  | { type: 'ADD_CLIP'; payload: AddClipInput }
  | { type: 'CAPTURE_CLIP'; payload: AddClipInput }
  | { type: 'UPDATE_CLIP'; payload: { id: string; content: string; title?: string } }
  | { type: 'TOGGLE_FAVORITE'; payload: { id: string } }
  | { type: 'DELETE_CLIP'; payload: { id: string } }
  | { type: 'RESTORE_DELETED_CLIP'; payload: { token: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'CLEAR_ALL' };

export interface UndoOffer {
  token: string;
  expiresAt: number;
}

export interface RuntimeResponse {
  ok: boolean;
  state?: StorageState;
  error?: string;
  undo?: UndoOffer;
  permissions?: {
    websiteAccess: boolean;
  };
  companion?: {
    available: boolean;
    imported: number;
    error?: string;
  };
}
