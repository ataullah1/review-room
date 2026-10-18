import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/brand.css";
import { productionOrigin } from "@/lib/config/deployment";
export const metadata: Metadata = {
  metadataBase: new URL(productionOrigin),
  applicationName: "Review Room",
  manifest: "/site.webmanifest",
  appleWebApp: { capable: false, title: "Review Room" },
  title: "Review Room — A little feedback. A better result.",
  description:
    "An image review workspace with pinned feedback, version comparison and client approvals.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: "#fafbf9",
  colorScheme: "light",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/dm-sans-latin-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
