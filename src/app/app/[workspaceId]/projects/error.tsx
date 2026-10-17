"use client";
import { Button } from "@/components/ui/button";
export default function ProjectError({ retry }: { retry: () => void }) {
  return (
    <section className="private-content">
      <div className="private-empty">
        <h1>We couldn’t load this project space.</h1>
        <p>Please try again in a moment.</p>
        <Button onClick={retry}>Try again</Button>
      </div>
    </section>
  );
}
