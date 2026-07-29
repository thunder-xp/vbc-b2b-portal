import { useId } from "react";

export function FormField({ label, required, helperText, error, children }: {
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : helperText ? `${id}-help` : undefined;
  return <label className="grid gap-1.5 text-sm font-medium text-zinc-800" htmlFor={id}>
    <span>{label}{required ? <span aria-hidden="true" className="ml-1 text-red-600">*</span> : null}</span>
    {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
    {error ? <span className="text-sm text-red-700" id={`${id}-error`}>{error}</span> : helperText ? <span className="text-xs font-normal text-zinc-500" id={`${id}-help`}>{helperText}</span> : null}
  </label>;
}
