"use client";

import { useCallback } from "react";
import { useWizard } from "./wizard-context";
import type { Episode } from "@/lib/types";

/**
 * Encapsulates the podcast + anthem generation pipeline.
 * Separated from SchemaPicker so the component stays UI-only.
 */
export function useGeneration() {
  const { state, dispatch, startGenerating, backToSchema } = useWizard();

  const showError = useCallback(
    (message: string) => {
      dispatch({ type: "SET_STATUS", status: `Error: ${message}` });
    },
    [dispatch]
  );

  /** Build the common request body fields for a given schema + source. */
  const buildBody = useCallback(
    async (
      schemaFqn: string,
      extra: Record<string, unknown> = {}
    ): Promise<Record<string, unknown>> => {
      const body: Record<string, unknown> = {
        schemaFqn,
        source: state.source,
        ...extra,
      };
      if (state.source === "openmetadata") {
        body.url = state.omUrl;
        body.token = state.token;
      } else if (state.source === "dbt-cloud") {
        body.dbtCloud = {
          accountId: state.dbtAccountId,
          projectId: state.dbtProjectId,
          token: state.dbtToken,
        };
      } else if (state.source === "dbt-local" && state.manifestFile) {
        const text = await state.manifestFile.text();
        body.dbtLocal = { manifestContent: text };
      } else if (state.source === "the-graph") {
        body.theGraph = {
          subgraphUrl: state.graphUrl,
          apiKey: state.graphApiKey || undefined,
        };
      } else if (state.source === "dune") {
        body.dune = {
          apiKey: state.duneApiKey,
          namespace: state.duneNamespace || undefined,
          queryUrl: state.duneQueryUrl || undefined,
        };
      } else if (state.source === "coral") {
        body.coral = { query: state.coralQuery };
      }
      return body;
    },
    [state]
  );

  /** Run the full podcast generation pipeline (streaming). */
  const generatePodcast = useCallback(
    async (schemaFqn: string) => {
      startGenerating();
      dispatch({ type: "SET_GEN_STEP", step: 0 });
      dispatch({ type: "SET_GEN_SEGMENTS", count: 0 });
      dispatch({ type: "SET_GEN_TOTAL", total: 0 });
      dispatch({ type: "SET_GEN_STARTED_AT", time: 0 });
      dispatch({ type: "SET_GEN_FINDINGS", findings: [] });
      dispatch({ type: "SET_STATUS", status: "Checking your data\u2026" });

      try {
        const body = await buildBody(schemaFqn);
        if (state.researchQuestion.trim()) {
          body.researchQuestion = state.researchQuestion.trim();
        }

        // Pre-validate schema
        const validateRes = await fetch("/api/validate-schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (validateRes.ok) {
          const validation = await validateRes.json();
          if (validation.quality === "empty") {
            dispatch({ type: "SET_STATUS", status: `\u274c ${validation.message}` });
            backToSchema();
            return;
          }
          if (validation.quality === "thin") {
            dispatch({
              type: "SET_STATUS",
              status: `\u26a0\ufe0f ${validation.message} \u2014 generating anyway\u2026`,
            });
          } else {
            const s = validation.stats;
            dispatch({
              type: "SET_STATUS",
              status: `\u2713 Schema looks good (${s.tableCount} tables, ${s.totalTests} tests) \u2014 generating\u2026`,
            });
          }
        }

        const res = await fetch("/api/synthesize-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const data = await res.json();
            if (typeof data?.error === "string" && data.error) message = data.error;
          } catch {
            // Keep fallback
          }
          showError(message);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          showError("No response stream");
          return;
        }

        const decoder = new TextDecoder();
        const audioChunks: ArrayBuffer[] = [];
        const segmentByteSizes: Record<number, number> = {};
        let sfxBytes = 0;
        let metadata: Episode | null = null;
        let sseBuffer = "";
        let localGenSegments = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data: any;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (data.type === "metadata") {
              dispatch({ type: "SET_GEN_STEP", step: 1 });
              metadata = {
                schemaFqn: data.schemaFqn,
                schemaName: data.schemaName,
                tableCount: data.tableCount,
                qualitySummary: {
                  passed: data.testsTotal - data.testsFailed,
                  failed: data.testsFailed,
                  total: data.testsTotal,
                },
                script: data.script,
                schemaMeta: data.schemaMeta,
                researchQuestion: data.researchQuestion,
                researchTrail: data.researchTrail,
                researchSessionId: data.researchSessionId,
              };
              const findings: string[] = [];
              if (data.tableCount)
                findings.push(`\ud83d\udcca Found ${data.tableCount} tables`);
              if (data.testsFailed > 0)
                findings.push(
                  `\u26a0\ufe0f ${data.testsFailed} failing test${data.testsFailed > 1 ? "s" : ""} detected`
                );
              if (data.testsTotal === 0)
                findings.push("\ud83d\udd0d No quality tests configured");
              if (data.schemaMeta?.lineage?.length > 0)
                findings.push(
                  `\ud83d\udd17 Analyzing lineage for ${data.schemaMeta.lineage.length} edges`
                );
              if (findings.length > 0)
                dispatch({ type: "SET_GEN_FINDINGS", findings });
            } else if (data.type === "schema_rejected") {
              dispatch({ type: "SET_STATUS", status: `\u274c ${data.message}` });
              backToSchema();
              break;
            } else if (data.type === "quality_warning") {
              dispatch({
                type: "SET_STATUS",
                status: `\u26a0\ufe0f ${data.message}`,
              });
            } else if (data.type === "estimate") {
              dispatch({ type: "SET_GEN_TOTAL", total: data.segments });
              dispatch({
                type: "SET_GEN_STARTED_AT",
                time: Date.now(),
              });
              dispatch({
                type: "SET_STATUS",
                status: `Generating ${data.segments} speech segments + sound effects`,
              });
            } else if (data.type === "audio") {
              dispatch({ type: "SET_GEN_STEP", step: 2 });
              const audioData = Uint8Array.from(atob(data.data as string), (c) =>
                c.charCodeAt(0)
              );
              audioChunks.push(audioData.buffer as ArrayBuffer);
              if (data.segment !== undefined) {
                segmentByteSizes[data.segment] =
                  (segmentByteSizes[data.segment] || 0) + audioData.byteLength;
                localGenSegments++;
                dispatch({
                  type: "SET_GEN_SEGMENTS",
                  count: localGenSegments,
                });
              } else {
                sfxBytes += audioData.byteLength;
              }
              dispatch({
                type: "SET_STATUS",
                status: `Recording audio\u2026 segment ${audioChunks.length}`,
              });
            } else if (data.type === "done" && metadata) {
              if (audioChunks.length === 0) {
                dispatch({ type: "SET_EPISODE", episode: metadata });
                dispatch({ type: "SET_AUDIO_URL", url: null });
                dispatch({
                  type: "SET_STATUS",
                  status: "Transcript ready (no audio generated)",
                });
                dispatch({ type: "SET_STEP", step: "episode" });
                break;
              }
              const blob = new Blob(audioChunks, { type: "audio/mpeg" });
              const url = URL.createObjectURL(blob);
              dispatch({
                type: "SET_EPISODE",
                episode: { ...metadata, audioUrl: url },
              });
              dispatch({ type: "SET_AUDIO_URL", url });

              const totalSegmentBytes = Object.values(segmentByteSizes).reduce(
                (a, b) => a + b,
                0
              );
              const totalBytes = totalSegmentBytes + sfxBytes;
              if (totalBytes > 0) {
                const computedDuration = totalBytes / 16000;
                dispatch({
                  type: "SET_AUDIO_DURATION",
                  duration: computedDuration,
                });

                if (metadata.script.length > 0 && totalSegmentBytes > 0) {
                  let cumulative = 0;
                  const offsets = metadata.script.map((_: unknown, i: number) => {
                    const offset = cumulative / totalBytes;
                    cumulative += segmentByteSizes[i] || 0;
                    return offset;
                  });
                  dispatch({ type: "SET_SEGMENT_OFFSETS", offsets });
                }
              }

              dispatch({ type: "SET_STATUS", status: "" });
              dispatch({ type: "SET_STEP", step: "episode" });
            } else if (data.type === "error") {
              showError(data.error);
            }
          }
        }
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        dispatch({ type: "SET_GEN_STEP", step: -1 });
      }
    },
    [buildBody, dispatch, showError, startGenerating, backToSchema, state.researchQuestion]
  );

  /** Run anthem generation (non-streaming). */
  const generateAnthem = useCallback(
    async (schemaFqn: string) => {
      startGenerating();
      dispatch({ type: "SET_STATUS", status: "Composing your Data Anthem\u2026" });

      try {
        const body = await buildBody(schemaFqn, {
          type: "anthem",
          persona: state.persona,
        });

        const res = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const data = await res.json();
            if (typeof data?.error === "string" && data.error) message = data.error;
          } catch {
            // keep fallback
          }
          showError(message);
          return;
        }

        const data = await res.json();
        if (!data.ok) {
          showError(data.error || "Anthem generation failed");
          return;
        }

        const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        const anthemEpisode: Episode = {
          schemaFqn,
          schemaName: schemaFqn.split(".").slice(-1)[0],
          tableCount: 0,
          qualitySummary: { passed: 0, failed: 0, total: 0 },
          script: [],
          musicPlan: data.musicPlan,
        };

        dispatch({
          type: "SET_EPISODE",
          episode: { ...anthemEpisode, audioUrl: url },
        });
        dispatch({ type: "SET_AUDIO_URL", url });
        dispatch({ type: "SET_GROVE_CID", cid: data.groveCid || null });
        dispatch({ type: "SET_STATUS", status: "" });
        dispatch({ type: "SET_STEP", step: "episode" });
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        dispatch({ type: "SET_GEN_STEP", step: -1 });
      }
    },
    [buildBody, dispatch, showError, startGenerating, state.persona]
  );

  return { generatePodcast, generateAnthem };
}
