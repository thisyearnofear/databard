"use client";

interface SkeletonProps {
  className?: string;
  lines?: number;
  variant?: "text" | "card" | "avatar" | "waveform";
}

export function Skeleton({ className = "", lines = 1, variant = "text" }: SkeletonProps) {
  const baseClasses = "animate-pulse bg-[var(--border)] rounded";
  
  if (variant === "card") {
    return (
      <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 ${className}`}>
        <div className="space-y-3">
          <div className={`h-4 ${baseClasses} rounded w-3/4`} />
          <div className={`h-3 ${baseClasses} rounded w-1/2`} />
        </div>
      </div>
    );
  }
  
  if (variant === "avatar") {
    return (
      <div className={`w-10 h-10 ${baseClasses} rounded-full flex-shrink-0`} />
    );
  }
  
  if (variant === "waveform") {
    return (
      <div className={`flex items-center justify-center gap-1 h-16 ${className}`}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={`w-1 ${baseClasses} rounded-full`}
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    );
  }
  
  // Default: text lines
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-4 ${baseClasses} rounded`}
          style={{ width: i === lines - 1 && lines > 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

// Episode player skeleton
export function EpisodePlayerSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Waveform */}
      <div className="h-32 bg-gradient-to-b from-[var(--accent)]/5 to-transparent flex items-center justify-center px-6">
        <div className="flex items-center justify-center gap-1 h-16 w-full">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-[var(--accent)]/30 rounded-full animate-pulse"
              style={{ height: `${20 + Math.sin(i * 0.3) * 30 + Math.random() * 20}%` }}
            />
          ))}
        </div>
      </div>
      
      {/* Controls */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--border)] rounded-full animate-pulse" />
            <div className="space-y-1">
              <div className="h-4 bg-[var(--border)] rounded w-32 animate-pulse" />
              <div className="h-3 bg-[var(--border)] rounded w-24 animate-pulse" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-[var(--border)] rounded animate-pulse" />
            <div className="w-8 h-8 bg-[var(--border)] rounded animate-pulse" />
            <div className="w-8 h-8 bg-[var(--border)] rounded animate-pulse" />
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)]/50 rounded-full w-1/3 animate-pulse" />
          </div>
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span className="animate-pulse">0:00</span>
            <span className="animate-pulse">2:34</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Schema list skeleton
export function SchemaListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
          <div className="w-4 h-4 bg-[var(--border)] rounded animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-[var(--border)] rounded w-3/4 animate-pulse" />
            <div className="h-2 bg-[var(--border)] rounded w-1/2 animate-pulse" />
          </div>
          <div className="w-6 h-6 bg-[var(--border)] rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// Connection skeleton
export function ConnectionSkeleton() {
  return (
    <div className="w-full max-w-md space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <div className="w-12 h-12 bg-[var(--border)] rounded-xl animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[var(--border)] rounded w-2/3 animate-pulse" />
            <div className="h-3 bg-[var(--border)] rounded w-1/3 animate-pulse" />
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--text-muted)] text-center animate-pulse">
        Discovering schemas…
      </p>
    </div>
  );
}
