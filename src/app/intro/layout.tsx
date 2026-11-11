import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TERMBridge — From agreement to payment",
  description:
    "One connected workflow for commercial intelligence, negotiation, approvals and B2B payment.",
};

export default function IntroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
