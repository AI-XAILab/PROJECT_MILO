import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

const variants = {
  default: "milo-button primary",
  secondary: "milo-button secondary",
  outline: "milo-button outline",
  ghost: "milo-button ghost",
  destructive: "milo-button destructive",
};

const sizes = {
  default: "milo-button md",
  sm: "milo-button sm",
  lg: "milo-button lg",
  icon: "milo-button icon",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({ className, variant = "default", size = "default", asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(variants[variant], sizes[size], className)} {...props} />;
}
