import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'border-input bg-card flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
      'placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
      'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
