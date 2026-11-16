// Host-call helpers for DataBard. Dependency-free so node tests can
// import it directly. Pattern follows brume/anna/bundle/session.js.

export function unwrap(res) {
  // SDK calls resolve {ok:true,result} or {ok:false,error}; some harness
  // paths reject instead. Normalize both to throw-on-failure.
  if (res && typeof res === "object") {
    if (res.ok === false) {
      const err = res.error || {};
      const e = new Error(err.message || "host call failed");
      e.code = err.code;
      e.data = err.data;
      throw e;
    }
    if (res.ok === true && "result" in res) return res.result;
  }
  return res;
}

export function storageValue(res) {
  const r = unwrap(res);
  if (r == null) return null;
  if (typeof r === "object" && "value" in r) return r.value;
  return r;
}

export function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      const e = new Error(`${label} timed out`);
      e.code = "TIMEOUT";
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function storageGet(anna, key) {
  return storageValue(await anna.storage.get({ key, scope: "user" }));
}

export async function storageSet(anna, key, value) {
  return unwrap(await anna.storage.set({ key, value, scope: "user" }));
}
