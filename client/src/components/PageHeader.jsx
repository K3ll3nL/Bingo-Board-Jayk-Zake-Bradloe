import React from 'react';
import { useNavigate } from 'react-router-dom';

const maxWidthClasses = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '7xl': 'max-w-7xl',
};

/**
 * Unified page header used across all sub-pages.
 *
 * Props:
 *   title      {string}   Required. Page title.
 *   subtitle   {string}   Optional. Small descriptive text below the title.
 *   badge      {'mod'|'pro'} Optional. Hero badge shown next to the title.
 *   onBack     {function} Optional. Custom back handler. Defaults to navigate('/').
 *   completion {{ caught: number, total: number }} Optional. Pokédex completion shown on the right.
 *   maxWidth   {'3xl'|'4xl'|'7xl'} Optional. Inner max-width. Defaults to '7xl'.
 */
const PageHeader = ({
  title,
  subtitle,
  badge,
  onBack,
  completion,
  maxWidth = '7xl',
}) => {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate('/'));
  const widthClass = maxWidthClasses[maxWidth] ?? 'max-w-7xl';

  return (
    <header className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#35373b' }}>
      <div className={`${widthClass} mx-auto px-4 py-2 md:py-4`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={handleBack}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white truncate">{title}</h1>
                {badge === 'mod' && (
                  <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full font-medium shrink-0">
                    Moderator
                  </span>
                )}
                {badge === 'pro' && (
                  <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-medium shrink-0">
                    Pro
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {completion && (
            <div className="text-right shrink-0">
              <div className="text-sm text-gray-400">Caught</div>
              <div className="text-xl font-bold text-purple-400">
                {completion.caught} / {completion.total}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default PageHeader;
