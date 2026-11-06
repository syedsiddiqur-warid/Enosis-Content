import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enosis Solutions",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function LinksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
