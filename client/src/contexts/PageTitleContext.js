import { createContext } from 'react';

/**
 * Shared context for page-level metadata.
 * AppLayout reads it to adapt the header on sub-pages.
 * PageHeader writes it (renders null).
 */
export const PageTitleContext = createContext({
  pageMeta: { title: '', badge: null, subtitle: null, completion: null },
  setPageMeta: () => {},
});
