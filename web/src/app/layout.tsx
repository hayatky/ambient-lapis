import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { themeInitializationScript } from "@/lib/theme";

import "./globals.css";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Ambient Lapis",
  description:
    "Nature Remo Lapisの温湿度とエアコン認識状態を確認するダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
      </head>
      <body>
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
