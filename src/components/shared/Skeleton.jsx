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

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`glass-panel border border-brand-border rounded-xl p-5 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-slate-700/40 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 bg-slate-700/40 rounded animate-pulse" />
          <div className="h-2 w-1/2 bg-slate-700/30 rounded animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-2 w-full bg-slate-700/30 rounded animate-pulse" />
        <div className="h-2 w-4/5 bg-slate-700/30 rounded animate-pulse" />
      </div>
    </div>
  );
}

export default Skeleton;
