// Minimal fake SDK for listing captures — mirrors the real bridge shapes:
// {ok:true,result} / {ok:false,error} envelopes over HTTP test endpoints.

const __q = new URLSearchParams(location.search);
if (Number.isFinite(+(__q.get("watchdogms") || NaN))) {
  globalThis.__DATABARD_BOOT_WATCHDOG_MS = +__q.get("watchdogms");
}

const rpc = (path, body) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json());

export const AnnaAppRuntime = {
  async connect() {
    const boot = await fetch("/__startup").then((r) => r.json()).catch(() => ({}));
    if (boot.delayMs) await new Promise((r) => setTimeout(r, boot.delayMs));
    if (boot.fail) throw new Error("startup fail injected");
    const listeners = {};
    return {
      window: { set_title: async () => ({ ok: true }) },
      storage: {
        get: async (args) => {
          // ?poison=checkpoint returns a checkpoint-shaped value that throws
          // when the app touches a field — corrupt, not malformed.
          if (__q.get("poison") === "checkpoint" && args?.key === "databard/active-task") {
            const payload = new Proxy({}, {
              get() { throw new Error("poisoned checkpoint field"); },
            });
            return { ok: true, result: { value: { v: 1, id: "poison-1", stage: "reading", tone: "straight", purpose: "cleanup", payload } } };
          }
          return { ok: true, result: { value: (await rpc("/__kv", { op: "get", ...args })).value } };
        },
        set: (args) => rpc("/__kv", { op: "set", ...args }),
        list: async (args) => ({ ok: true, result: await rpc("/__kv", { op: "list", ...args }) }),
      },
      llm: {
        complete: (req) => rpc("/__llm", req),
      },
      entryPayload: (await (await fetch("/__entry")).json()).payload ?? null,
      on(event, cb) {
        (listeners[event] ||= []).push(cb);
        globalThis.__pushPayload = (p) => cb(p);
      },
    };
  },
};
