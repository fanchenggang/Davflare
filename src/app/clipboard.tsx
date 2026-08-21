import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type ClipboardMode = "copy" | "cut";

export interface ClipboardState {
  mode: ClipboardMode;
  keys: string[];
}

interface ClipboardContextValue {
  clipboard: ClipboardState | null;
  copy: (keys: string[]) => void;
  cut: (keys: string[]) => void;
  clear: () => void;
}

const ClipboardContext = createContext<ClipboardContextValue>({
  clipboard: null,
  copy: () => {},
  cut: () => {},
  clear: () => {},
});

export function useClipboard() {
  return useContext(ClipboardContext);
}

export function ClipboardProvider({ children }: { children: React.ReactNode }) {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  const copy = useCallback(
    (keys: string[]) => setClipboard({ mode: "copy", keys }),
    []
  );
  const cut = useCallback(
    (keys: string[]) => setClipboard({ mode: "cut", keys }),
    []
  );
  const clear = useCallback(() => setClipboard(null), []);

  const value = useMemo(
    () => ({ clipboard, copy, cut, clear }),
    [clipboard, copy, cut, clear]
  );

  return (
    <ClipboardContext.Provider value={value}>
      {children}
    </ClipboardContext.Provider>
  );
}
