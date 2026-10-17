import { LinkEntry } from "@/features/sharing/link-entry";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <LinkEntry kind="share" />;
}
