import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn-style, source-owned primitive; keep the established product classes.
const buttonVariants = cva("ui-button", {
  variants: {
    variant: { default: "primary", outline: "outline" },
  },
  defaultVariants: { variant: "default" },
});

export function Button({
  className,
  variant,
  asChild = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}
