import "server-only";
import { getSocietySettings, type SocietySettings } from "@techvaults/db";
import { cache } from "react";
import { inSociety, requireWorkspace } from "./session";

/** The current society's settings (words, colour, modules), loaded once per request. */
export const requireSociety = cache(async (): Promise<SocietySettings> => {
  const ws = await requireWorkspace();
  return inSociety(ws, (tx) => getSocietySettings(tx, ws.actor));
});
