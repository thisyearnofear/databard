"use client";

import { useWizard } from "./wizard-context";
import { useGeneration } from "./useGeneration";
import { SchemasEmpty, SearchEmpty } from "@/components/EmptyState";

const SCHEMAS_PER_PAGE = 10;

export function SchemaPicker() {
  const { 
    state, dispatch, 
    filteredSchemas, recommendedSchema, 
    questionPresets, sourceLabel, activeContext,
  } = useWizard();
  const { generatePodcast, generateAnthem } = useGeneration();
  
  // Group schemas by prefix
  const groupedSchemas = (() => {
    const groups: Record<string, string[]> = {};
    for (const s of filteredSchemas) {
      const parts = s.split(".");
      const prefix = parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(s);
    }
    return groups;
  })();
  
  const groupKeys = Object.keys(groupedSchemas);
  const hasMultipleGroups = groupKeys.length > 1;
  const totalPages = Math.ceil(filteredSchemas.length / SCHEMAS_PER_PAGE);
  const paginatedSchemas = filteredSchemas.slice(state.schemaPage * SCHEMAS_PER_PAGE, (state.schemaPage + 1) * SCHEMAS_PER_PAGE);
  
  // Sort groups: recommended group first, then alphabetically
  const recommendedGroup = recommendedSchema
    ? (() => { const p = recommendedSchema.split("."); return p.length > 1 ? p.slice(0, -1).join(".") : "default"; })()
    : null;
  const sortedGroupKeys = [...groupKeys].sort((a, b) => {
    if (a === recommendedGroup) return -1;
    if (b === recommendedGroup) return 1;
    return a.localeCompare(b);
  });
  
  return (
    <div className="w-full max-w-3xl flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Select a schema</h2>
        <button onClick={() => dispatch({ type: "RESET" })} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">← Back</button>
      </div>
      
      {/* Context bar */}
      <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <span className="text-lg">🔌</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{sourceLabel[state.source]} · {activeContext}</p>
          <p className="text-xs text-[var(--text-muted)]">{filteredSchemas.length} schema{filteredSchemas.length !== 1 ? "s" : ""} available</p>
        </div>
      </div>
      
      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Schema list — left 3 cols */}
        <div className="md:col-span-3 flex flex-col gap-3" data-tour="schema-picker">
          {state.schemas.length > 5 && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">🔍</span>
              <input 
                data-testid="schema-search"
                type="text" 
                placeholder="Search schemas…" 
                value={state.searchQuery} 
                onChange={(e) => dispatch({ type: "SET_SEARCH_QUERY", query: e.target.value })}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none transition-colors" 
              />
            </div>
          )}
          <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 scrollbar-thin">
            {state.schemas.length === 0
              ? <SchemasEmpty />
              : filteredSchemas.length === 0
              ? <SearchEmpty query={state.searchQuery} />
              : hasMultipleGroups
                ? sortedGroupKeys.flatMap((group) => {
                    const items = groupedSchemas[group];
                    const hasRecommended = items.includes(recommendedSchema ?? "");
                    const groupLeaf = group.split(".").slice(-1)[0] ?? group;
                    return [
                      <div key={`hdr-${group}`} className="flex items-center gap-2 px-3 py-1.5 mt-1 first:mt-0">
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${hasRecommended ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                          {groupLeaf}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">({items.length})</span>
                        {hasRecommended && <span className="text-[10px] text-[var(--accent)]">⭐</span>}
                        <div className="flex-1 h-px bg-[var(--border)]" />
                      </div>,
                      ...items.map((s) => {
                        const leaf = s.split(".").slice(-1)[0] ?? s;
                        const isSelected = state.selectedSchema === s;
                        const isRecommended = s === recommendedSchema;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => dispatch({ type: "SET_SELECTED_SCHEMA", schema: s })}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[var(--accent)] text-white shadow-sm"
                                : "hover:bg-[var(--bg)]"
                            }`}
                          >
                            <span className="text-sm">{isSelected ? "✓" : "○"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${isSelected ? "font-semibold" : "font-medium"}`}>{leaf}</span>
                                {isRecommended && !isSelected && <span className="text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded-full shrink-0">⭐</span>}
                              </div>
                              <p className={`text-xs truncate mt-0.5 ${isSelected ? "text-white/70" : "text-[var(--text-muted)]"}`}>{s}</p>
                            </div>
                          </button>
                        );
                      }),
                    ];
                  })
                : paginatedSchemas.map((s) => {
                    const leaf = s.split(".").slice(-1)[0] ?? s;
                    const isSelected = state.selectedSchema === s;
                    const isRecommended = s === recommendedSchema;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => dispatch({ type: "SET_SELECTED_SCHEMA", schema: s })}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[var(--accent)] text-white shadow-sm"
                            : "hover:bg-[var(--bg)]"
                        }`}
                      >
                        <span className="text-sm">{isSelected ? "✓" : "○"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${isSelected ? "font-semibold" : "font-medium"}`}>{leaf}</span>
                            {isRecommended && !isSelected && <span className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded-full">⭐</span>}
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${isSelected ? "text-white/70" : "text-[var(--text-muted)]"}`}>{s}</p>
                        </div>
                      </button>
                    );
                  })
            }
          </div>
          {!hasMultipleGroups && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_SCHEMA_PAGE", page: Math.max(0, state.schemaPage - 1) })}
                disabled={state.schemaPage === 0}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >← Prev</button>
              <span className="text-xs text-[var(--text-muted)]">{state.schemaPage + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_SCHEMA_PAGE", page: Math.min(totalPages - 1, state.schemaPage + 1) })}
                disabled={state.schemaPage >= totalPages - 1}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >Next →</button>
            </div>
          )}
        </div>
        
        {/* Right panel — question + generate */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {/* Research question */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3" data-tour="research-question">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium">Your question</label>
              <span className="text-[10px] text-[var(--accent)] opacity-75" title="A focused question helps the AI hosts investigate specific issues">💡</span>
            </div>
            <textarea
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm min-h-20 resize-y focus:border-[var(--accent)] focus:outline-none transition-colors"
              value={state.researchQuestion}
              onChange={(e) => dispatch({ type: "SET_RESEARCH_QUESTION", question: e.target.value })}
              placeholder={state.persona === "enterprise"
                ? "What is the biggest risk in this dataset?"
                : "Which data health issue should we investigate first?"}
            />
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text)] mb-1">💡 Good questions are specific:</p>
              <ul className="space-y-0.5 ml-3">
                <li>✓ "Which tables have failing tests with downstream dependents?"</li>
                <li>✓ "Where is the biggest PII exposure risk?"</li>
                <li>✗ "Tell me about my data" (too vague)</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {questionPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => dispatch({ type: "SET_RESEARCH_QUESTION", question: preset })}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    state.researchQuestion === preset
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
                      : "border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--text)] text-[var(--text-muted)]"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          
          {/* Selected schema + generate CTA */}
          <div className={`border rounded-xl p-4 flex flex-col gap-3 transition-all overflow-hidden ${
            state.selectedSchema
              ? "border-[var(--accent)] bg-[var(--accent)]/5"
              : "border-[var(--border)] bg-[var(--surface)]"
          }`}>
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium">Selected dataset</p>
            {state.selectedSchema ? (
              <div className="min-w-0">
                <p className="text-base font-semibold truncate">{state.selectedSchema.split(".").slice(-1)[0]}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 break-all">{state.selectedSchema}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)] italic">← Pick a schema from the list</p>
            )}
            {!state.selectedSchema && (
              <p className="text-xs text-center text-[var(--text-muted)] italic">Select a schema to generate</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => state.selectedSchema && generatePodcast(state.selectedSchema)}
                disabled={!state.selectedSchema}
                className="flex flex-col items-center justify-center bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-3 py-3 text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.01]"
              >
                <span>🎙️ Podcast</span>
                <span className="text-xs opacity-75 font-normal mt-0.5">AI hosts · analysis</span>
              </button>
              <button
                type="button"
                onClick={() => state.selectedSchema && generateAnthem(state.selectedSchema)}
                disabled={!state.selectedSchema}
                className="flex flex-col items-center justify-center rounded-lg border-2 px-3 py-3 text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.01]"
                style={{borderColor: "#a855f7", background: "linear-gradient(135deg, var(--surface), #a855f710)", color: "#a855f7"}}
              >
                <span>🎵 Anthem</span>
                <span className="text-xs opacity-75 font-normal mt-0.5">Music · lyrics</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
