import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaUpdater from "./pwa-updater";
import OrientationLock from "./orientation-lock";
import VisualViewportGuard from "./visual-viewport-guard";
import ProtectedNavigationGuard from "./protected-navigation-guard";
import KioskHistoryGuard from "./kiosk-history-guard";

export const metadata: Metadata = {
  title: "Menu | Marta Banaszek atelier-café",
  description: "Aktualna karta Marta Banaszek atelier-café: kawa, herbata, kuchnia, desery, wina i wydarzenia.",
  icons: {
    icon: [{ url: "/favicon.svg" }, { url: "/menu-icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Menu Café",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Menu Café" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased"><PwaUpdater /><OrientationLock /><VisualViewportGuard/><ProtectedNavigationGuard/><KioskHistoryGuard/>{children}</body>
    </html>
  );
}
