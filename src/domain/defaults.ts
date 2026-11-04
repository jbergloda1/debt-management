import type { ID, ProfileSettings, ProfileState, YearMonth } from './types';

export const CURRENT_SCHEMA_VERSION = 5;

export const DEFAULT_SETTINGS: ProfileSettings = {
  defaultCardPaymentPolicy: 'current_balance',
  dueSoonThresholdDays: 5,
  utilizationWarning: 0.3,
  weekendShift: 'none',
  holidays: [],
  reminderDaysBefore: [5, 1],
  highAprThreshold: 0.4,
  loanDebtMeasure: 'auto',
  groupByDate: false,
};

export function newId(prefix: string): ID {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

export function newProfileState(opts: {
  name: string;
  currency?: string;
  locale?: string;
  viewMonth: YearMonth;
  settings?: Partial<ProfileSettings>;
}): ProfileState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: {
      id: newId('profile'),
      name: opts.name,
      currency: opts.currency ?? 'VND',
      locale: opts.locale ?? 'vi-VN',
      settings: { ...DEFAULT_SETTINGS, ...opts.settings },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    institutions: [],
    creditLines: [],
    obligations: [],
    statements: [],
    payments: [],
    plannedAmounts: {},
    cashAccounts: [],
    incomes: [],
    expenses: [],
    scenarios: [
      { id: newId('scn'), name: 'Cơ bản', horizonMonths: 12, assumeAllPaidOnTime: true, cardMonthlySpending: {} },
    ],
    viewMonth: opts.viewMonth,
  };
}
