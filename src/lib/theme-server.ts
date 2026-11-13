import "server-only";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "./theme";

export async function getTheme() {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}
