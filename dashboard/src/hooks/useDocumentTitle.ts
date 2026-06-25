import { useEffect } from 'react';

/**
 * Custom hook to set document title dynamically.
 * Automatically appends " | Zetu" suffix.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Zetu`;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
