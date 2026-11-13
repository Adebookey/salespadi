import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { THEME_COLOR } from "@/lib/theme";
import { getTheme } from "@/lib/theme-server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SalesPadi", template: "%s · SalesPadi" },
  description: "Your padi for selling on WhatsApp and Instagram.",
  appleWebApp: { capable: true, title: "SalesPadi", statusBarStyle: "black-translucent" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: THEME_COLOR[theme], colorScheme: theme };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  return (
    <html lang="en" className={`${geistSans.variable} ${theme === "dark" ? "dark" : ""} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
