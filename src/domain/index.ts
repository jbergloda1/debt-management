// API engine (mục 10.3) — mọi hàm thuần, nhận `today` làm tham số.
import { alerts as alertsWith } from './alerts';
import { creditLineUsage as usageWith } from './creditLine';
import { dueItemsForMonth as itemsWith } from './dueItems';
import { createEngine } from './engine';
import { formatMoney } from './money';
import { project as projectWith } from './projection';
import { monthlySummary as summaryWith } from './summary';
import type { ID, ISODate, ProfileState, Scenario, YearMonth } from './types';

export { buildSchedule } from './schedule';
export { loanMetrics } from './metrics';
export { createEngine };

export const dueItemsForMonth = (s: ProfileState, month: YearMonth, today: ISODate) => itemsWith(createEngine(s, today), month);
export const creditLineUsage = (s: ProfileState, lineId: ID, today: ISODate, month: YearMonth = s.viewMonth) =>
  usageWith(createEngine(s, today), lineId, month);
export const monthlySummary = (s: ProfileState, month: YearMonth, today: ISODate) => summaryWith(createEngine(s, today), month);
export const project = (s: ProfileState, scenario: Scenario, fromMonth: YearMonth, today: ISODate) =>
  projectWith(createEngine(s, today), scenario, fromMonth);
export function alerts(s: ProfileState, today: ISODate, month: YearMonth = s.viewMonth) {
  const engine = createEngine(s, today);
  return alertsWith(engine, month, summaryWith(engine, month), (m) => formatMoney(m, s.profile.currency, s.profile.locale));
}
