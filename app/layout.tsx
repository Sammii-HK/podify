import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Podify — AI Podcast Generator",
  description: "Turn any content into a podcast episode with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
