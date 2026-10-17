import Link from "next/link";
import ReviewRoom from "@/components/review-room";
export default function Page() {
  return (
    <>
      <ReviewRoom />
      <Link className="prototype-auth-link" href="/app">
        Open your workspace →
      </Link>
    </>
  );
}
