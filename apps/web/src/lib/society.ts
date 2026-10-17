import "server-only";
import { getSocietySettings, withSociety, type SocietySettings } from "@techvaults/db";
import { cache } from "react";
import { db } from "./db";
import { inSociety, requirePortal, requireWorkspace } from "./session";

/** The current society's settings (words, colour, modules), loaded once per request. */
export const requireSociety = cache(async (): Promise<SocietySettings> => {
  const ws = await requireWorkspace();
  return inSociety(ws, (tx) => getSocietySettings(tx, ws.actor));
});

/** The society settings for the member portal's chosen society. */
export const requirePortalSociety = cache(async (): Promise<SocietySettings> => {
  const portal = await requirePortal();
  return withSociety(db(), portal.society.societyId, (tx) => getSocietySettings(tx, portal.actor));
});
