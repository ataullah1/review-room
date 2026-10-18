import { DemoDesk } from "@/features/demo/demo-desk";
export const metadata = {
  title: "Try the demo — Review Room",
  description:
    "Explore an isolated guest review workspace with original sample designs.",
  robots: { index: false, follow: false },
};
export default function DemoPage() {
  return <DemoDesk />;
}
