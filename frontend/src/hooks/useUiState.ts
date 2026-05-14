import { useState, useCallback } from 'react';

export type CenterTab = 'state' | 'flow';
export type RightTab = 'events' | 'api';

/** UI-only state: which tabs/panels are visible. */
export function useUiTabs() {
  const [centerTab, setCenterTab] = useState<CenterTab>('state');
  const [rightTab, setRightTab] = useState<RightTab>('events');
  return { centerTab, setCenterTab, rightTab, setRightTab };
}

/** Stable boolean toggle. */
export function useToggle(initial = false): [boolean, () => void, (v: boolean) => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle, setValue];
}
