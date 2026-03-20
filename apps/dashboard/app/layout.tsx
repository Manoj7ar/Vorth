import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vorth",
  description: "Intelligent chaos engineering for GitLab merge requests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-body">{children}</body>
    </html>
  );
}
