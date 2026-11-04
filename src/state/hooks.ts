import { useCallback, useMemo } from 'react';
import { alerts } from '../domain/alerts';
import { formatDate, formatShortDate } from '../domain/dates';
import { createEngine, type Engine } from '../domain/engine';
import { formatMoney, formatRate } from '../domain/money';
import { monthlySummary } from '../domain/summary';
import type { Money, ProfileState } from '../domain/types';
import { useStore } from './store';

/** State của profile đang mở (chỉ dùng bên trong khung app, khi đã có profile). */
export function useProfile(): ProfileState {
  const s = useStore((x) => x.state);
  if (!s) throw new Error('Chưa có profile');
  return s;
}

export const useUpdate = () => useStore((x) => x.update);

export function useEngine(): Engine {
  const state = useProfile();
  const today = useStore((x) => x.today);
  return useMemo(() => createEngine(state, today), [state, today]);
}

export interface Fmt {
  money(m: Money | undefined): string;
  /** Không bị ẩn ở chế độ riêng tư (dùng cho ô nhập) */
  moneyRaw(m: Money): string;
  rate(r: number, digits?: number): string;
  date(d?: string): string;
  short(d?: string): string;
}

export function useFmt(): Fmt {
  const { currency, locale } = useProfile().profile;
  const privacy = useStore((x) => x.privacy);
  return useMemo(
    () => ({
      money: (m) => (m === undefined ? '—' : privacy ? '•••' : formatMoney(m, currency, locale)),
      moneyRaw: (m) => formatMoney(m, currency, locale),
      rate: (r, d = 1) => formatRate(r, locale, d),
      date: (d) => formatDate(d, locale),
      short: (d) => formatShortDate(d, locale),
    }),
    [currency, locale, privacy],
  );
}

export function useSummary() {
  const engine = useEngine();
  const month = useProfile().viewMonth;
  return useMemo(() => monthlySummary(engine, month), [engine, month]);
}

export function useAlerts() {
  const engine = useEngine();
  const summary = useSummary();
  const { currency, locale } = useProfile().profile;
  const fmt = useCallback((m: Money) => formatMoney(m, currency, locale), [currency, locale]);
  return useMemo(() => alerts(engine, summary.month, summary, fmt), [engine, summary, fmt]);
}
