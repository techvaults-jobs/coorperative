import "server-only";
import { cookies } from "next/headers";

export type Theme = "system" | "light" | "dark";

/** The viewer's saved theme, so the server renders it without a flash. */
export async function savedTheme(): Promise<Theme> {
  const value = (await cookies()).get("cv_theme")?.value;
  return value === "light" || value === "dark" ? value : "system";
}
