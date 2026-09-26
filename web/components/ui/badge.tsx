import * as React from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="badge" className={cn("milo-badge", className)} {...props} />;
}
