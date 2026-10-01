import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  applicationName: "Codelean",
  title: "Codelean · PR Checker",
  description: "A considered second look at every pull request.",
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
