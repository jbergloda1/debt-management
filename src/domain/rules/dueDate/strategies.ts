import { addDays, addMonths, addMonthsYM, dayOf, monthOf, setDay } from '../../dates';
import type { ISODate } from '../../types';
import { registerDueDateStrategy } from './registry';

/** Ngày sao kê đầu tiên kể từ startDate (cùng tháng nếu chưa qua ngày sao kê). */
function firstStatementDate(start: ISODate, statementDay: number): ISODate {
  const sameMonth = setDay(monthOf(start), statementDay);
  return start <= sameMonth ? sameMonth : setDay(addMonthsYM(monthOf(start), 1), statementDay);
}

registerDueDateStrategy('fixed_day', {
  label: 'Ngày cố định hàng tháng',
  firstDueDate: (r, start) =>
    setDay(
      addMonthsYM(monthOf(start), dayOf(start) <= r.cutoffDay ? r.offsetIfOnOrBeforeCutoff : r.offsetIfAfterCutoff),
      r.day,
    ),
  nthDueDate: (r, first, n) => setDay(addMonthsYM(monthOf(first), n - 1), r.day),
  describe: (r) =>
    `Ngày ${r.day} hàng tháng; mở ≤ ngày ${r.cutoffDay} → kỳ đầu sau ${r.offsetIfOnOrBeforeCutoff} tháng, ` +
    `sau ngày ${r.cutoffDay} → sau ${r.offsetIfAfterCutoff} tháng`,
});

registerDueDateStrategy('same_day_as_start', {
  label: 'Cùng ngày với ngày giải ngân',
  firstDueDate: (r, start) => addMonths(start, r.offsetMonths ?? 1),
  // Tính từ startDate (không từ kỳ đầu) để giữ ngày 31 đúng như EDATE
  nthDueDate: (r, _first, n, ctx) => addMonths(ctx.startDate, (r.offsetMonths ?? 1) + n - 1),
  describe: (r) => `Cùng ngày giải ngân, kỳ đầu sau ${r.offsetMonths ?? 1} tháng`,
});

registerDueDateStrategy('statement_offset', {
  label: 'Sao kê + N ngày',
  firstDueDate: (r, start) => addDays(firstStatementDate(start, r.statementDay), r.daysAfterStatement),
  nthDueDate: (r, first, n) => {
    const firstStatement = addDays(first, -r.daysAfterStatement);
    return addDays(setDay(addMonthsYM(monthOf(firstStatement), n - 1), r.statementDay), r.daysAfterStatement);
  },
  describe: (r) => `Sao kê ngày ${r.statementDay}, đến hạn sau ${r.daysAfterStatement} ngày`,
});

registerDueDateStrategy('statement_fixed_due', {
  label: 'Sao kê ngày X, đến hạn ngày Y',
  firstDueDate: (r, start) => {
    const st = firstStatementDate(start, r.statementDay);
    return setDay(addMonthsYM(monthOf(st), r.dueDay > r.statementDay ? 0 : 1), r.dueDay);
  },
  nthDueDate: (r, first, n) => setDay(addMonthsYM(monthOf(first), n - 1), r.dueDay),
  describe: (r) => `Sao kê ngày ${r.statementDay}, đến hạn ngày ${r.dueDay}${r.dueDay > r.statementDay ? '' : ' tháng sau'}`,
});

registerDueDateStrategy('explicit', {
  label: 'Lịch nhập tay',
  firstDueDate: (r) => [...r.dates].sort()[0],
  nthDueDate: (r, _first, n) => [...r.dates].sort()[n - 1],
  maxPeriods: (r) => r.dates.length,
  describe: (r) => `Lịch nhập tay (${r.dates.length} ngày)`,
});

registerDueDateStrategy('every_n_days', {
  label: 'Mỗi N ngày',
  firstDueDate: (r) => addDays(r.anchor, r.n),
  nthDueDate: (r, _first, k) => addDays(r.anchor, r.n * k),
  describe: (r) => `Mỗi ${r.n} ngày kể từ ${r.anchor}`,
});
