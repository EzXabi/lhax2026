import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KBC Home — Your home, your choices",
  description:
    "The customer shares, KBC guides. A household demonstration with fictitious data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
