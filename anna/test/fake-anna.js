// In-memory fake host for node tests — mirrors the SDK call shapes:
// storage.get → {value, exists}, storage.set → {etag}, storage.list →
// {items:[{key}], next_cursor}, web.search → {results:[…]}, llm.complete →
// {content:{text}, stopReason, usage}.

export function fakeAnna({ search, llm } = {}) {
  const store = new Map();
  const calls = { search: [], llm: [], set: [], get: [] };

  const anna = {
    store,
    calls,
    storage: {
      get: async ({ key }) => {
        calls.get.push(key);
        return {
          value: store.has(key) ? store.get(key) : null,
          exists: store.has(key),
          etag: null,
        };
      },
      set: async ({ key, value }) => {
        calls.set.push(key);
        store.set(key, value);
        return { etag: "fake-etag" };
      },
      list: async ({ prefix } = {}) => ({
        items: [...store.keys()]
          .filter((k) => !prefix || k.startsWith(prefix))
          .map((key) => ({ key })),
        next_cursor: null,
      }),
    },
    web: {
      search: async (args) => {
        calls.search.push(args);
        return search ? search(args) : { results: [] };
      },
    },
    llm: {
      complete: async (req) => {
        calls.llm.push(req);
        return llm ? llm(req) : { content: { type: "text", text: "{}" }, stopReason: "endTurn" };
      },
    },
    window: { set_title: async () => ({}) },
    entryPayload: null,
    on: () => {},
  };
  return anna;
}
