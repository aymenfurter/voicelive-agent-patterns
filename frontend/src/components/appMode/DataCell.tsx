import type { ReactNode } from 'react';

interface CellProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DataCell({ title, icon, children, className }: CellProps) {
  return (
    <div className={`data-cell ${className ?? ''}`}>
      <div className="data-cell__header">
        {icon}
        <span className="data-cell__title">{title}</span>
      </div>
      <div className="data-cell__content">{children}</div>
    </div>
  );
}
