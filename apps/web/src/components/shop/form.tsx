import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const labelClass = 'block text-[11px] font-semibold tracking-[0.14em] uppercase';
const controlClass =
  'mt-2 block h-12 w-full border bg-transparent px-3 text-sm outline-none transition-colors focus:border-foreground disabled:opacity-60';

export const primaryButton =
  'inline-flex w-full items-center justify-center bg-foreground py-4 text-[11px] font-semibold tracking-[0.18em] text-background uppercase transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40';
export const secondaryButton =
  'inline-flex items-center justify-center border border-foreground px-5 py-3 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40';
export const textButton =
  'text-[11px] font-medium tracking-[0.14em] uppercase underline underline-offset-[5px] decoration-1 transition-opacity hover:opacity-60 disabled:opacity-40';

export const errorText = 'text-xs text-red-700 dark:text-red-400';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
}

export function TextField({
  label,
  error,
  hint,
  className = '',
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={`${controlClass} ${error ? 'border-red-700 dark:border-red-400' : 'border-line'}`}
        {...input}
      />
      {(error || hint) && (
        <p id={`${id}-note`} className={`mt-1.5 ${error ? errorText : 'text-xs text-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  className = '',
  children,
  ...select
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={`${controlClass} cursor-pointer ${error ? 'border-red-700 dark:border-red-400' : 'border-line'}`}
        {...select}
      >
        {children}
      </select>
      {error && <p className={`mt-1.5 ${errorText}`}>{error}</p>}
    </div>
  );
}
