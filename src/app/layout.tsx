import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { BRAND } from "@/lib/constants/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    "Clear business insights for small-business owners. An intelligent decision support system with predictive analytics.",
  icons: { icon: "/brand/basira-mark.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
