import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import {
  SearchEngine,
  BUILTIN_ENGINES,
  DEFAULT_ENGINE_ID,
  STORAGE_KEY_ENGINES,
  STORAGE_KEY_CURRENT,
} from '@/types/searchEngine';

interface SearchEngineContextType {
  engines: SearchEngine[];
  currentEngineId: string;
  currentEngine: SearchEngine;
  enabledEngines: SearchEngine[];

  setCurrentEngineId: (id: string) => void;
  toggleEngineEnabled: (id: string) => boolean;
  addCustomEngine: (data: { name: string; urlTemplate: string }) => SearchEngine;
  updateCustomEngine: (id: string, patch: Partial<Pick<SearchEngine, 'name' | 'urlTemplate'>>) => void;
  deleteCustomEngine: (id: string) => void;
  cycleToNext: () => void;
}

const SearchEngineContext = createContext<SearchEngineContextType | undefined>(undefined);

function loadEnginesFromStorage(): SearchEngine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENGINES);
    if (!raw) return [...BUILTIN_ENGINES];
    const parsed = JSON.parse(raw) as SearchEngine[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...BUILTIN_ENGINES];
    const result = [...parsed];
    for (const builtin of BUILTIN_ENGINES) {
      if (!result.some((e) => e.id === builtin.id)) {
        result.push({ ...builtin });
      }
    }
    return result;
  } catch {
    return [...BUILTIN_ENGINES];
  }
}

function loadCurrentIdFromStorage(): string {
  return localStorage.getItem(STORAGE_KEY_CURRENT) || DEFAULT_ENGINE_ID;
}

function extractHost(urlTemplate: string): string {
  try {
    const probed = urlTemplate.replace('{query}', 'test');
    return new URL(probed).hostname;
  } catch {
    return '';
  }
}

export function SearchEngineProvider({ children }: { children: ReactNode }) {
  const [engines, setEngines] = useState<SearchEngine[]>(() => loadEnginesFromStorage());
  const [currentEngineId, setCurrentEngineIdState] = useState<string>(() => loadCurrentIdFromStorage());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ENGINES, JSON.stringify(engines));
    } catch {
      // ignore
    }
  }, [engines]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT, currentEngineId);
    } catch {
      // ignore
    }
  }, [currentEngineId]);

  const enabledEngines = useMemo(() => engines.filter((e) => e.enabled), [engines]);

  const currentEngine = useMemo(() => {
    const found = engines.find((e) => e.id === currentEngineId);
    if (found && found.enabled) return found;
    return enabledEngines[0] || engines[0] || BUILTIN_ENGINES[0];
  }, [engines, currentEngineId, enabledEngines]);

  useEffect(() => {
    if (currentEngine.id !== currentEngineId) {
      setCurrentEngineIdState(currentEngine.id);
    }
  }, [currentEngine.id, currentEngineId]);

  const setCurrentEngineId = useCallback((id: string) => {
    setCurrentEngineIdState(id);
  }, []);

  const toggleEngineEnabled = useCallback((id: string): boolean => {
    let blocked = false;
    setEngines((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target) return prev;
      if (target.enabled && prev.filter((e) => e.enabled).length === 1) {
        blocked = true;
        return prev;
      }
      return prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
    });
    return !blocked;
  }, []);

  const addCustomEngine = useCallback((data: { name: string; urlTemplate: string }): SearchEngine => {
    const newEngine: SearchEngine = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name,
      urlTemplate: data.urlTemplate,
      iconType: 'favicon',
      iconValue: extractHost(data.urlTemplate),
      isBuiltin: false,
      enabled: true,
    };
    setEngines((prev) => [...prev, newEngine]);
    return newEngine;
  }, []);

  const updateCustomEngine = useCallback(
    (id: string, patch: Partial<Pick<SearchEngine, 'name' | 'urlTemplate'>>) => {
      setEngines((prev) =>
        prev.map((e) => {
          if (e.id !== id || e.isBuiltin) return e;
          const next = { ...e, ...patch };
          if (patch.urlTemplate) {
            next.iconValue = extractHost(patch.urlTemplate);
          }
          return next;
        })
      );
    },
    []
  );

  const deleteCustomEngine = useCallback((id: string) => {
    setEngines((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target || target.isBuiltin) return prev;
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const cycleToNext = useCallback(() => {
    setCurrentEngineIdState((prevId) => {
      const list = engines.filter((e) => e.enabled);
      if (list.length === 0) return prevId;
      const idx = list.findIndex((e) => e.id === prevId);
      const nextIdx = (idx + 1) % list.length;
      return list[nextIdx].id;
    });
  }, [engines]);

  const value: SearchEngineContextType = {
    engines,
    currentEngineId: currentEngine.id,
    currentEngine,
    enabledEngines,
    setCurrentEngineId,
    toggleEngineEnabled,
    addCustomEngine,
    updateCustomEngine,
    deleteCustomEngine,
    cycleToNext,
  };

  return <SearchEngineContext.Provider value={value}>{children}</SearchEngineContext.Provider>;
}

export function useSearchEngine(): SearchEngineContextType {
  const ctx = useContext(SearchEngineContext);
  if (!ctx) throw new Error('useSearchEngine must be used inside SearchEngineProvider');
  return ctx;
}
