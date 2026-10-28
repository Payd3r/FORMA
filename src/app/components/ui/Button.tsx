import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

const variantMap: Record<Variant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger'
};

const Button: React.FC<Props> = ({
  variant = 'primary',
  className,
  children,
  loading = false,
  disabled,
  ...rest
}) => {
  return (
    <button
      className={clsx(variantMap[variant], className, loading && 'opacity-80')}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? 'Attendi...' : children}
    </button>
  );
};

export default Button;
