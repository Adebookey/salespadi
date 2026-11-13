// Theme preference: dark unless the person has switched to light. Stored in a cookie so the server
// renders the right theme on the first paint (no white flash for light-sensitive eyes).
export type Theme = "dark" | "light";
export const THEME_COOKIE = "theme";
export const THEME_COLOR: Record<Theme, string> = { dark: "#0a0d12", light: "#f5f6f8" };

export const parseTheme = (value: string | undefined): Theme => (value === "light" ? "light" : "dark");
