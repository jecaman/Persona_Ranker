import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona Ranker",
  description: "Rank and qualify leads against an ideal customer persona",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
