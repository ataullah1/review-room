"use client";
import { Button } from "@/components/ui/button";
export function PrintSummary() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      Print / Save PDF
    </Button>
  );
}
