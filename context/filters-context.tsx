import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EMPTY_FILTERS, type GlobalFilters } from "@/lib/queries";

const STORAGE_KEY = "converge.filters.v1";

interface FiltersContextValue {
  /** Live filter values (updated on every keystroke). */
  filters: GlobalFilters;
  /** Debounced copy, used for queries to avoid a request per keystroke. */
  debounced: GlobalFilters;
  setFilters: (filters: GlobalFilters) => void;
  resetFilters: () => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

function loadStoredFilters(): GlobalFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<GlobalFilters>;
    return { ...EMPTY_FILTERS, ...parsed };
  } catch {
    return EMPTY_FILTERS;
  }
}

/**
 * Global filter state shared by every dashboard/table page. It lives outside the
 * pages and is mirrored to localStorage, so a filter stays applied while the user
 * navigates between screens and even after a page reload — until it is cleared
 * with "Limpar" (resetFilters).
 */
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<GlobalFilters>(() =>
    loadStoredFilters(),
  );
  const [debounced, setDebounced] = useState<GlobalFilters>(filters);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // storage unavailable (private mode) — filters simply stop persisting
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      debounced,
      setFilters: (f) => setFiltersState(f),
      resetFilters: () => setFiltersState(EMPTY_FILTERS),
    }),
    [filters, debounced],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters deve ser usado dentro de FiltersProvider");
  return ctx;
}
