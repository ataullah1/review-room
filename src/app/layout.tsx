import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Review Room — A little feedback. A better result.",
  description:
    "An image review workspace for creative teams and clients. Static prototype with sample data.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
