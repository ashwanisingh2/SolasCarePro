import React from 'react';

/**
 * Skeleton loaders — replace jarring spinner-only loading states with
 * layout-preserving shimmer placeholders. Reduces perceived layout shift
 * and gives the app a premium feel.
 *
 * Usage:
 *   <Skeleton rows={3} />                   // 3 stacked line placeholders
 *   <SkeletonTable cols={5} rows={8} />     // table-shaped skeleton
 *   <SkeletonCard />                        // card-shaped skeleton
 */
export function Skeleton({ rows = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-slate-700/40 rounded animate-pulse"
          style={{ width: `${80 + Math.sin(i) * 15}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ cols = 5, rows = 8, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header row */}
      <div className="flex gap-3 px-3 py-2 border-b border-brand-border">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-700/40 rounded animate-pulse flex-1" />
        ))}
      </div>
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-3 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-3 bg-slate-700/30 rounded animate-pulse flex-1"
              style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
