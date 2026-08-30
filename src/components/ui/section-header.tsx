import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  tag?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function SectionHeader({
  title,
  description,
  tag,
  badge,
  actions,
  className,
  children,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3",
        className
      )}
      {...props}
    >
      <div className="space-y-1 min-w-0">
        {tag && (
          <div className="text-xs text-muted-foreground font-medium">
            {tag}
          </div>
        )}
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
        {children}
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          {actions}
        </div>
      )}
    </div>
  );
}
