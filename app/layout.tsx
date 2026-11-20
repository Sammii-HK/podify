import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Podify: the listening room",
  description:
    "Shape source material into a podcast episode, then listen and read along.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
