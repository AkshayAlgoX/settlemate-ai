"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  disabled?: boolean;
}

export interface DropdownProps {
  value: string;
  onValueChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  "data-testid"?: string;
  ariaLabel?: string;
}

export function Dropdown({
  value,
  onValueChange,
  options,
  placeholder = "Select an option...",
  className,
  triggerClassName,
  contentClassName,
  disabled,
  size = "default",
  "data-testid": testId = "shared-dropdown",
  ariaLabel,
}: DropdownProps) {
  return (
    <div data-testid={testId} className={cn("inline-block", className)}>
      <Select
        value={value}
        onValueChange={(val) => {
          if (val !== null && val !== undefined) {
            onValueChange(val);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger
          size={size}
          aria-label={ariaLabel}
          className={cn(
            "min-w-[150px] border-border bg-card text-xs sm:text-sm text-foreground hover:border-foreground/30 hover:bg-accent/40 focus-visible:border-foreground/50 focus-visible:ring-1 focus-visible:ring-ring transition-colors",
            triggerClassName
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className={cn(
            "border border-border bg-popover text-xs sm:text-sm text-popover-foreground shadow-2xl z-50 p-1 rounded-xl",
            contentClassName
          )}
        >
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              className="cursor-pointer text-xs sm:text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus:bg-accent focus:text-foreground data-[selected]:bg-accent/70 data-[selected]:text-foreground data-[selected]:font-medium data-[checked=true]:bg-accent/70 data-[checked=true]:text-foreground data-[checked=true]:font-medium py-1.5 px-2.5 rounded-lg"
            >
              <div className="flex items-center justify-between gap-2.5 w-full">
                <span className="truncate">{opt.label}</span>
                {opt.badge && (
                  <span className="font-mono text-[10px] text-muted-foreground border border-border bg-card px-1.5 py-0.5 rounded shrink-0">
                    {opt.badge}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
