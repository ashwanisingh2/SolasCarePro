import { useState, useEffect } from 'react';

/**
 * useDebounced — returns a debounced copy of `value` that only updates
 * after `delayMs` has elapsed since the last change. Use it as the
 * dependency of a `useMemo` to debounce expensive filter operations
 * triggered by typing in a search box.
 *
 * Example:
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounced(query, 200);
 *   const filtered = useMemo(() => list.filter(x => x.name.includes(debouncedQuery)), [list, debouncedQuery]);
 */
export function useDebounced(value, delayMs = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
