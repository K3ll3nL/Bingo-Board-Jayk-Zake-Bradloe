import { useContext, useEffect } from 'react';
import { PageTitleContext } from '../contexts/PageTitleContext';

/**
 * Invisible metadata-setter for the shared AppLayout header.
 * Renders nothing — writes title/badge/subtitle/completion into PageTitleContext
 * so AppLayout can display them in the single top nav.
 *
 * Props:
 *   title      {string}   Required.
 *   subtitle   {string}   Optional.
 *   badge      {'mod'|'pro'} Optional.
 *   completion {{ caught: number, total: number }} Optional.
 *   onBack     {function} Accepted but ignored — AppLayout uses smart-back by default
 *                         (navigate(-1) if history exists, else navigate('/') ).
 *   maxWidth   any        Accepted but ignored — layout width is controlled per-page.
 */
const PageHeader = ({ title, subtitle, badge, completion }) => {
  const { setPageMeta } = useContext(PageTitleContext);

  useEffect(() => {
    setPageMeta({
      title: title ?? '',
      badge: badge ?? null,
      subtitle: subtitle ?? null,
      completion: completion ?? null,
    });
    // Don't clear on unmount — the home page ignores pageMeta entirely,
    // and clearing causes a brief title flash when navigating between sub-pages.
  }, [title, subtitle, badge, completion?.caught, completion?.total]);

  return null;
};

export default PageHeader;
