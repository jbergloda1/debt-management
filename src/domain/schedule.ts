import { DEFAULT_ROUNDING } from './money';
import { generateDueDates, getInterestModel, perPeriodFeesOf, periodFees } from './rules';
import type { InstallmentLoanObligation, Institution, ProfileSettings, RoundingPolicy, ScheduleRow } from './types';

export const roundingOf = (ob: InstallmentLoanObligation, inst?: Institution): RoundingPolicy =>
  ob.rounding ?? inst?.defaults?.rounding ?? DEFAULT_ROUNDING;

/** Bảng kỳ hạn đầy đủ của khoản vay (mục 6.1). */
export function buildSchedule(
  ob: InstallmentLoanObligation,
  inst: Institution | undefined,
  settings: Pick<ProfileSettings, 'weekendShift' | 'holidays'>,
): ScheduleRow[] {
  const rounding = roundingOf(ob, inst);
  const base = getInterestModel(ob.interestModel.type).rows(ob.interestModel, {
    principal: ob.principal,
    periods: ob.periods,
    rounding,
  });
  const dates = generateDueDates(ob.dueRule, ob.startDate, base.length, {
    weekendShift: inst?.defaults?.weekendShift ?? settings.weekendShift,
    holidays: settings.holidays,
  });
  const fees = perPeriodFeesOf(ob, inst);
  let remaining = ob.principal;
  return dates.map((dueDate, i) => {
    const { principal, interest } = base[i];
    const n = i + 1;
    const f = periodFees(fees, n, ob.principal, principal + interest, rounding);
    remaining -= principal;
    return { n, dueDate, principal, interest, fees: f, total: principal + interest + f, principalRemainingAfter: remaining };
  });
}
