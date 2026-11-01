// Document store: built-in sample documents + documents the learner uploads.
// Uploaded documents are kept in this browser only (localStorage).
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DOCUMENTS } from "./nusabot.js";
import { MAX_DOCS } from "./loaders.js";

const KEY = "lab-docs-v1";
const DocsContext = createContext(null);

const builtIns = Object.entries(DOCUMENTS).map(([id, d]) => ({ id, ...d, user: false }));

function readSaved() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(docs) {
  try { localStorage.setItem(KEY, JSON.stringify(docs.map(({ raw, ...d }) => d))); return true; } catch { return false; }
}

export function DocsProvider({ children }) {
  const [userDocs, setUserDocs] = useState(readSaved);
  const [savedOk, setSavedOk] = useState(true);
  const add = useCallback((doc) => {
    setUserDocs((old) => {
      const next = [...old.filter((d) => d.title !== doc.title), doc].slice(-MAX_DOCS);
      setSavedOk(save(next));
      return next;
    });
  }, []);
  const remove = useCallback((id) => {
    setUserDocs((old) => { const next = old.filter((d) => d.id !== id); save(next); return next; });
  }, []);
  const value = useMemo(() => ({
    docs: [...builtIns, ...userDocs], userDocs, add, remove, savedOk,
    get: (id) => [...builtIns, ...userDocs].find((d) => d.id === id),
  }), [userDocs, add, remove, savedOk]);
  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export const useDocs = () => useContext(DocsContext);
