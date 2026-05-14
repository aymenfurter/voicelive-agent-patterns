interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Generic tab strip — replaces ad-hoc center-tab markup duplicated across panels. */
export function Tabs<T extends string>({ items, value, onChange, className }: Props<T>) {
  return (
    <div className={className ?? 'center-tabs'} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          className={`center-tab${value === item.id ? ' center-tab--active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
