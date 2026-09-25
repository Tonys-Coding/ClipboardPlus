import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CheckIcon, ClipboardIcon, LinkIcon, PauseIcon, PlayIcon, PlusIcon, SearchIcon, SettingsIcon, StarIcon, TrashIcon, XIcon } from '../components/Icons';
import { captureIsPaused, filterClips, STORAGE_KEY } from '../lib/clips';
import { COMPANION_ENABLED } from '../lib/build';
import { isRestrictedPage, resolveCaptureStatus, type CaptureStatus, type ListenerHealth } from '../lib/captureStatus';
import { captureIsAuthorized, hasWebsiteAccess } from '../lib/capturePermissions';
import { hasSnippetFields } from '../lib/pasteTools';
import { sendMessage } from '../lib/runtime';
import type { Clip, Settings, StorageState, UndoOffer } from '../lib/types';
import { ClipCard } from './ClipCard';
import { EditDialog } from './EditDialog';
import { PreviewDialog } from './PreviewDialog';
import { SnippetDialog, TransformDialog } from './SmartPasteDialogs';
import { TypeGlyph } from './TypeGlyph';
import './popup.css';

type Toast = { kind: 'success' | 'error'; message: string } | null;
type ClipFilter = 'all' | 'text' | 'url' | 'code' | 'favorite';
type LoadStatus = 'loading' | 'ready' | 'error';

const CAPTURE_CHECK_TIMEOUT_MS = 4_000;
const INITIAL_LOAD_TIMEOUT_MS = 4_000;

async function probeCaptureListener(tabId: number | undefined, reinject: boolean): Promise<ListenerHealth> {
  if (!tabId) return 'unavailable';

  const ping = async (): Promise<ListenerHealth> => {
    let response: unknown;
    try {
      response = await chrome.tabs.sendMessage(tabId, { type: 'PING_CAPTURE' });
    } catch {
      return 'unavailable';
    }
    if (!response || typeof response !== 'object') return 'unavailable';
    const health = response as Partial<{ ready: boolean; settingsLoaded: boolean; enabled: boolean; paused: boolean; excluded: boolean }>;
    if (health.ready !== true) return 'unavailable';
    // The listener answered but its settings are still loading, so capture is not usable yet.
    if (health.settingsLoaded !== true) return 'loading';
    if (health.excluded === true) return 'excluded';
    if (health.paused === true) return 'paused';
    return health.enabled === true ? 'ready' : 'unavailable';
  };

  const first = await ping();
  if (first !== 'unavailable' || !reinject) return first;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    return await ping();
  } catch {
    return 'unavailable';
  }
}

function capturePauseNotice(settings: Settings | null | undefined): string {
  if (!settings?.capturePausedUntil) return 'Automatic website capture is paused.';
  const end = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(settings.capturePausedUntil);
  return `Automatic website capture is paused until ${end}.`;
}

export function Popup() {
  const [state, setState] = useState<StorageState | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClipFilter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Clip | null>(null);
  const [snippetRequest, setSnippetRequest] = useState<{ clip: Clip; template: string } | null>(null);
  const [transforming, setTransforming] = useState<Clip | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('checking');
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Clip | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const addInput = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = state?.settings ?? null;
  const [captureCheckNonce, setCaptureCheckNonce] = useState(0);
  const refreshAttempt = useRef(0);
  const captureAttempt = useRef(0);
  const loadingRetries = useRef(0);
  const retryCaptureCheck = useCallback(() => {
    loadingRetries.current = 0;
    setCaptureCheckNonce((value) => value + 1);
  }, []);
  const captureSettingsKey = state?.settings
    ? JSON.stringify([
        state.settings.autoCapture,
        state.settings.captureConsentVersion,
        state.settings.captureConsentAt ?? null,
        state.settings.capturePaused,
        state.settings.capturePausedUntil,
        state.settings.excludedSites,
      ])
    : '';

  const dialogOpen = Boolean(editing || snippetRequest || transforming || previewing);

  // Layout timing keeps the background non-inert before a closing dialog restores focus into it.
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (node) {
      if (dialogOpen) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    }
    if (dialogOpen) {
      // Remember the control that started a dialog sequence so a dialog-to-dialog
      // handoff still returns to it once the last dialog closes.
      if (!dialogOpener.current && document.activeElement instanceof HTMLElement) {
        dialogOpener.current = document.activeElement;
      }
      return;
    }
    const opener = dialogOpener.current;
    dialogOpener.current = null;
    if (!opener) return;
    if (opener.isConnected) opener.focus();
    else (scrollRef.current?.querySelector<HTMLElement>('[data-clip-row]') ?? searchInput.current)?.focus();
  }, [dialogOpen]);

  const announce = useCallback((message: string) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(message), 60);
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const attempt = refreshAttempt.current + 1;
    refreshAttempt.current = attempt;
    setLoadStatus('loading');
    const timeout = window.setTimeout(() => {
      if (refreshAttempt.current !== attempt) return;
      setLoadStatus('error');
      setLoadError('Clipboard+ did not respond in time. Confirm the extension is enabled, then retry.');
    }, INITIAL_LOAD_TIMEOUT_MS);

    try {
      const response = await sendMessage({ type: COMPANION_ENABLED ? 'SYNC_COMPANION' : 'GET_STATE' });
      // A newer refresh owns the popup state now, so a late response is discarded.
      if (refreshAttempt.current !== attempt) return false;
      if (!response.state) {
        setLoadStatus('error');
        setLoadError('Clipboard+ returned no saved clips. Retry to load them again.');
        return false;
      }
      setState(response.state);
      setLoadStatus('ready');
      setLoadError('');
      return true;
    } catch (error) {
      if (refreshAttempt.current !== attempt) return false;
      setLoadStatus('error');
      setLoadError(error instanceof Error ? error.message : 'Could not load your clips.');
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]?.newValue) {
        // A live storage update is newer than any pending snapshot request.
        refreshAttempt.current += 1;
        setState(changes[STORAGE_KEY].newValue as StorageState);
        setLoadStatus('ready');
        setLoadError('');
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  useEffect(() => {
    const settings = settingsRef.current;
    if (!settings) return;
    let cancelled = false;
    const attempt = captureAttempt.current + 1;
    captureAttempt.current = attempt;
    let listenerHealth: ListenerHealth = 'ready';
    const guard = window.setTimeout(() => {
      if (!cancelled && captureAttempt.current === attempt) setCaptureStatus('unavailable');
    }, CAPTURE_CHECK_TIMEOUT_MS);
    // A retry after a failure has to look like work again instead of stale text.
    setCaptureStatus((current) => (current === 'unavailable' ? 'checking' : current));

    void (async () => {
      let status: CaptureStatus;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url ?? '';
        const websiteAccess = await hasWebsiteAccess();
        // Only an authorized, non-restricted page may be probed or reinjected.
        const authorized = captureIsAuthorized(settings, websiteAccess);
        if (authorized && !isRestrictedPage(url)) {
          listenerHealth = await probeCaptureListener(tab?.id, true);
        }
        status = resolveCaptureStatus({ url, settings, hasWebsiteAccess: websiteAccess, listener: listenerHealth });
      } catch {
        status = 'unavailable';
      } finally {
        window.clearTimeout(guard);
      }
      if (cancelled || captureAttempt.current !== attempt) return;
      const exhausted = status === 'checking' && loadingRetries.current >= 5;
      setCaptureStatus(exhausted ? 'unavailable' : status);
      if (status === 'checking' && !exhausted) {
        loadingRetries.current += 1;
        window.setTimeout(() => {
          if (!cancelled) setCaptureCheckNonce((value) => value + 1);
        }, 400);
      } else if (listenerHealth !== 'loading') {
        loadingRetries.current = 0;
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(guard);
    };
  }, [captureSettingsKey, captureCheckNonce, retryCaptureCheck]);

  useEffect(() => {
    const until = state?.settings.capturePaused ? state.settings.capturePausedUntil : null;
    if (!until) return;
    const timer = window.setTimeout(() => retryCaptureCheck(), Math.max(0, until - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [state?.settings.capturePaused, state?.settings.capturePausedUntil, retryCaptureCheck]);

  useEffect(() => {
    const recheck = () => retryCaptureCheck();
    const added = chrome.permissions.onAdded as chrome.events.Event<typeof recheck> | undefined;
    const removed = chrome.permissions.onRemoved as chrome.events.Event<typeof recheck> | undefined;
    const activated = chrome.tabs?.onActivated as chrome.events.Event<typeof recheck> | undefined;
    const updated = chrome.tabs?.onUpdated as chrome.events.Event<(tabId: number, changeInfo: { url?: string }) => void> | undefined;
    const onUpdated = (_tabId: number, changeInfo: { url?: string }) => {
      if (changeInfo.url) recheck();
    };
    added?.addListener(recheck);
    removed?.addListener(recheck);
    activated?.addListener(recheck);
    updated?.addListener(onUpdated);
    window.addEventListener('focus', recheck);
    return () => {
      added?.removeListener(recheck);
      removed?.removeListener(recheck);
      activated?.removeListener(recheck);
      updated?.removeListener(onUpdated);
      window.removeEventListener('focus', recheck);
    };
  }, [retryCaptureCheck]);

  useEffect(() => {
    if (addOpen) addInput.current?.focus();
  }, [addOpen]);

  useEffect(() => {
    searchInput.current?.focus();
  }, []);

  const focusRow = useCallback((index: number) => {
    const rows = scrollRef.current?.querySelectorAll<HTMLElement>('[data-clip-row]');
    if (!rows?.length) return false;
    const target = rows[Math.max(0, Math.min(index, rows.length - 1))];
    if (!target) return false;
    target.focus();
    target.scrollIntoView?.({ block: 'nearest' });
    return true;
  }, []);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowDown') return;
    if (focusRow(0)) event.preventDefault();
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const origin = (event.target as HTMLElement).closest<HTMLElement>('[data-clip-row]');
    if (!origin) return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-clip-row]'));
    const index = rows.indexOf(origin);
    if (index < 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        next.focus();
        next.scrollIntoView?.({ block: 'nearest' });
      } else if (event.key === 'ArrowUp') {
        searchInput.current?.focus();
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      rows[event.key === 'Home' ? 0 : rows.length - 1]?.focus();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      searchInput.current?.focus();
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!undoOffer) return;
    const timer = window.setTimeout(() => setUndoOffer(null), Math.max(0, undoOffer.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undoOffer]);

  const perform = async (action: Parameters<typeof sendMessage>[0], success?: string) => {
    try {
      const response = await sendMessage(action);
      if (response.state) setState(response.state);
      if (success) setToast({ kind: 'success', message: success });
      return true;
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
      return false;
    }
  };

  const visible = useMemo(() => {
    const matches = filterClips(state?.clips ?? [], query);
    if (filter === 'favorite') return matches.filter((clip) => clip.favorite);
    if (filter === 'text' || filter === 'url' || filter === 'code') return matches.filter((clip) => clip.type === filter);
    return matches;
  }, [filter, query, state?.clips]);
  const counts = useMemo(() => {
    const clips = state?.clips ?? [];
    return {
      all: clips.length,
      text: clips.filter((clip) => clip.type === 'text').length,
      url: clips.filter((clip) => clip.type === 'url').length,
      code: clips.filter((clip) => clip.type === 'code').length,
      favorite: clips.filter((clip) => clip.favorite).length,
    };
  }, [state?.clips]);
  const favorites = visible.filter((clip) => clip.favorite);
  const history = visible.filter((clip) => !clip.favorite);
  const capturePaused = state ? captureIsPaused(state.settings) : false;

  const copyText = async (content: string, clip: Clip, successMessage?: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(clip.id);
      if (successMessage) setToast({ kind: 'success', message: successMessage });
      announce(successMessage ? `${successMessage} to clipboard` : 'Copied to clipboard');
      window.setTimeout(() => setCopiedId((id) => (id === clip.id ? null : id)), 1400);
      return true;
    } catch {
      setToast({ kind: 'error', message: 'Clipboard access was blocked. Click the clip again or press Enter to copy.' });
      return false;
    }
  };

  const handleCopy = (clip: Clip) => {
    if (hasSnippetFields(clip.content)) {
      setSnippetRequest({ clip, template: clip.content });
      return;
    }
    void copyText(clip.content, clip);
  };

  const handleCopyOriginal = (clip: Clip) => {
    void copyText(clip.content, clip, 'Original copied');
  };

  const handlePreview = (clip: Clip) => setPreviewing(clip);

  const copyFromPreview = (clip: Clip) => {
    setPreviewing(null);
    handleCopy(clip);
  };

  const handleMenuOpenChange = useCallback((id: string, open: boolean) => {
    setOpenMenuId((current) => (open ? id : current === id ? null : current));
  }, []);

  const handleDelete = async (clip: Clip) => {
    // The trigger is focused when the menu action runs, so its row marks where to return.
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const row = activeElement?.closest('article')?.querySelector<HTMLElement>('[data-clip-row]') ?? null;
    const rows = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-clip-row]') ?? []);
    const index = row ? rows.indexOf(row) : -1;
    try {
      const response = await sendMessage({ type: 'DELETE_CLIP', payload: { id: clip.id } });
      if (response.state) setState(response.state);
      if (response.undo) {
        setUndoOffer(response.undo);
        announce('Clip deleted. Undo is available for eight seconds.');
      } else setToast({ kind: 'success', message: 'Clip deleted' });
      focusNearestRow(index);
      return true;
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Could not delete that clip.' });
      return false;
    }
  };

  const focusNearestRow = (index: number) => {
    window.setTimeout(() => {
      const next = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-clip-row]') ?? []);
      if (!next.length) {
        searchInput.current?.focus();
        return;
      }
      const target = next[Math.min(Math.max(index, 0), next.length - 1)];
      target?.scrollIntoView?.({ block: 'nearest' });
      target?.focus();
    }, 0);
  };

  const handleUndo = async () => {
    if (!undoOffer) return;
    const { token } = undoOffer;
    setUndoOffer(null);
    try {
      const response = await sendMessage({ type: 'RESTORE_DELETED_CLIP', payload: { token } });
      if (response.state) setState(response.state);
      setToast({ kind: 'success', message: 'Clip restored' });
      announce('Clip restored.');
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Could not restore that clip.' });
    }
  };

  const useTransformedResult = (content: string, clip: Clip) => {
    setTransforming(null);
    if (hasSnippetFields(content)) {
      setSnippetRequest({ clip, template: content });
      return;
    }
    void copyText(content, clip, 'Transformed copy ready');
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (await perform({ type: 'ADD_CLIP', payload: { content: draft } }, 'Saved to Clipboard+')) {
      setDraft('');
      setAddOpen(false);
    }
  };

  const saveTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:\/\//i.test(tab.url)) throw new Error('This Chrome page cannot be saved.');
      await perform({ type: 'ADD_CLIP', payload: { content: tab.url, title: tab.title, sourceUrl: tab.url } }, 'Current tab saved');
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save this tab.' });
    }
  };

  const toggleQuickPause = async () => {
    if (!state) return;
    const applied = capturePaused
      ? await perform({ type: 'UPDATE_SETTINGS', payload: { capturePaused: false, capturePausedUntil: null } }, 'Website capture resumed')
      : await perform({ type: 'UPDATE_SETTINGS', payload: { capturePaused: true, capturePausedUntil: Date.now() + 60 * 60 * 1000 } }, 'Website capture paused for one hour');
    // No forced status: re-resolve the real conditions from the updated settings.
    if (applied) retryCaptureCheck();
  };

  const renderSection = (title: string, clips: Clip[], favorite = false) => {
    if (!clips.length) return null;
    return (
      <section className="clip-section">
        <div className="section-heading">
          <span>{favorite && <span className="heading-star">★</span>}{title}</span>
          <span>{clips.length}</span>
        </div>
        <div className="clip-list">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              copied={copiedId === clip.id}
              menuOpen={openMenuId === clip.id}
              onMenuOpenChange={(open) => handleMenuOpenChange(clip.id, open)}
              onCopy={handleCopy}
              onCopyOriginal={handleCopyOriginal}
              onPreview={handlePreview}
              onTransform={setTransforming}
              onEdit={setEditing}
              onFavorite={(item) => void perform({ type: 'TOGGLE_FAVORITE', payload: { id: item.id } })}
              onDelete={(item) => void handleDelete(item)}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <main className={`popup-shell ${undoOffer ? 'has-undo' : ''}`}>
      <div className="popup-content" ref={contentRef}>
      <header className="app-header">
        <div className="brand">
          <img className="brand-mark" src="/icons/clipboard-plus-logo.png" alt="" />
          <span>Clipboard<strong>+</strong></span>
        </div>
        <div className="header-actions">
          {state?.settings.autoCapture && <button className={`icon-button privacy-button ${capturePaused ? 'active' : ''}`} type="button" aria-label={capturePaused ? 'Resume automatic web capture' : 'Pause automatic web capture for one hour'} onClick={() => void toggleQuickPause()}>{capturePaused ? <PlayIcon /> : <PauseIcon />}</button>}
          <button className="icon-button" type="button" aria-label="Open settings" onClick={() => void chrome.runtime.openOptionsPage()}><SettingsIcon /></button>
        </div>
      </header>

      <div className="command-row">
        <label className="search-box">
          <SearchIcon />
          <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Find a clip…" aria-label="Search clips" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><XIcon /></button>}
        </label>
        <div className="quick-actions">
          <button type="button" className={`action-button ${addOpen ? 'active' : ''}`} onClick={() => setAddOpen((open) => !open)}><PlusIcon /> Add clip</button>
          <button type="button" className="action-button" onClick={() => void saveTab()}><LinkIcon /> Save tab</button>
        </div>
      </div>

      {addOpen && (
        <form className="add-panel" onSubmit={handleAdd}>
          <label htmlFor="new-clip">Paste or type anything — use {'{{name}}'} for fill-in fields</label>
          <textarea id="new-clip" ref={addInput} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Text, URL, or Hello {{name}}" maxLength={50_000} required />
          <div className="form-actions"><button type="button" className="text-button" onClick={() => setAddOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={!draft.trim()}><PlusIcon /> Save clip</button></div>
        </form>
      )}

      <div className="filter-bar" role="group" aria-label="Filter clips">
        <button type="button" aria-label="All" aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><span>All</span><b>{counts.all}</b></button>
        <button type="button" aria-label="Text" aria-pressed={filter === 'text'} className={filter === 'text' ? 'active' : ''} onClick={() => setFilter('text')}><TypeGlyph type="text" /><span>Text</span><b>{counts.text}</b></button>
        <button type="button" aria-label="Links" aria-pressed={filter === 'url'} className={filter === 'url' ? 'active' : ''} onClick={() => setFilter('url')}><TypeGlyph type="url" /><span>Links</span><b>{counts.url}</b></button>
        <button type="button" aria-label="Code" aria-pressed={filter === 'code'} className={filter === 'code' ? 'active' : ''} onClick={() => setFilter('code')}><TypeGlyph type="code" /><span>Code</span><b>{counts.code}</b></button>
        <button type="button" aria-label="Favorites" aria-pressed={filter === 'favorite'} className={filter === 'favorite' ? 'active' : ''} onClick={() => setFilter('favorite')}><StarIcon /><span>Saved</span><b>{counts.favorite}</b></button>
      </div>

      {captureStatus === 'checking' && <div className="notice checking-notice"><span className="notice-spinner" aria-hidden="true" />Checking whether this page can be captured…</div>}
      {captureStatus === 'restricted' && <div className="notice"><span>This browser page cannot be captured. Try a normal website.</span></div>}
      {captureStatus === 'excluded' && <div className="notice notice-action"><span>This site is excluded in Clipboard+ settings.</span><button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>Open Capture Controls</button></div>}
      {captureStatus === 'permission' && <div className="notice notice-action"><span>Website access is off, so copies on websites are not saved.</span><button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>Open Capture Controls</button></div>}
      {captureStatus === 'disabled' && <div className="notice notice-action"><span>Automatic website capture is off.</span><button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>Open Capture Controls</button></div>}
      {captureStatus === 'unavailable' && <div className="notice error-notice notice-action"><span>Clipboard+ could not reach the capture listener on this page.</span><button type="button" onClick={retryCaptureCheck}>Retry</button></div>}
      {capturePaused && <div className="notice notice-action pause-notice"><span>{capturePauseNotice(state?.settings)}</span><button type="button" onClick={() => void toggleQuickPause()}>Resume</button></div>}

      <div className="content-scroll" ref={scrollRef} onKeyDown={handleListKeyDown}>
        {!state && loadStatus === 'loading' ? (
          <div className="loading" role="status" aria-live="polite"><span /><span /><span /><b className="sr-only">Loading your clips</b></div>
        ) : !state ? (
          <div className="load-error" role="alert">
            <h2>Clipboard+ could not load your clips</h2>
            <p>{loadError}</p>
            <button type="button" className="primary-button" onClick={() => void refresh()}>Retry loading clips</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">{query ? <SearchIcon /> : <ClipboardIcon />}</span>
            <h2>{query || filter !== 'all' ? 'No matching clips' : 'Your clipboard is ready'}</h2>
            <p>{query || filter !== 'all' ? 'Try another search or filter.' : COMPANION_ENABLED ? 'Copy text in any app or add your first clip above.' : 'Add a clip manually or enable website capture in Settings.'}</p>
          </div>
        ) : (
          <>{renderSection('Favorites', favorites, true)}{renderSection('Recent', history)}</>
        )}
      </div>

      {undoOffer && (
        <div className="undo-bar">
          <TrashIcon />
          <span>Clip deleted.</span>
          <button type="button" onClick={() => void handleUndo()}>Undo</button>
        </div>
      )}
      </div>

      {editing && (
        <EditDialog
          key={editing.id}
          clip={editing}
          onClose={() => setEditing(null)}
          onSave={(content) => perform({ type: 'UPDATE_CLIP', payload: { id: editing.id, content, title: editing.title } }, 'Clip updated')}
        />
      )}

      {previewing && (
        <PreviewDialog
          key={previewing.id}
          clip={previewing}
          onClose={() => setPreviewing(null)}
          onCopy={copyFromPreview}
          onCopyOriginal={handleCopyOriginal}
        />
      )}

      {snippetRequest && (
        <SnippetDialog
          key={`${snippetRequest.clip.id}:${snippetRequest.template}`}
          clip={snippetRequest.clip}
          template={snippetRequest.template}
          onClose={() => setSnippetRequest(null)}
          onCopy={(content, clip) => copyText(content, clip, 'Snippet copied')}
        />
      )}

      {transforming && (
        <TransformDialog
          key={transforming.id}
          clip={transforming}
          onClose={() => setTransforming(null)}
          onUseResult={useTransformedResult}
        />
      )}

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <CheckIcon /> : <span>!</span>}{toast.message}</div>}
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    </main>
  );
}
