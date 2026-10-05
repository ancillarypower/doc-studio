import { createContext, useContext } from "react";
import type { Studio } from "./useStudio";

export const StudioContext = createContext<Studio | null>(null);

export function useStudioContext(): Studio {
  const s = useContext(StudioContext);
  if (!s) throw new Error("useStudioContext must be used inside <StudioContext.Provider>");
  return s;
}
