import { pmt, rate } from '../../finance';
import { roundMoney, splitEven } from '../../money';
import { registerInterestModel, type InterestContext } from './registry';

const pct = (r: number, d = 2) => `${+(r * 100).toFixed(d)}%`;

/** Dư nợ giảm dần với số tiền trả mỗi kỳ cố định `payment`; kỳ cuối dồn phần lẻ. */
function amortize(ctx: InterestContext, monthlyRate: number, payment: number, keepLastTotal: boolean) {
  let balance = ctx.principal;
  const rows = [];
  for (let k = 1; k <= ctx.periods; k++) {
    const last = k === ctx.periods;
    let interest = roundMoney(balance * monthlyRate, ctx.rounding);
    const principal = last ? balance : Math.min(balance, Math.max(0, payment - interest));
    // fixed_installment: hợp đồng cố định số tiền mỗi kỳ → kỳ cuối giữ tổng = installment, phần lẻ dồn vào lãi
    if (last && keepLastTotal) interest = Math.max(0, payment - principal);
    balance -= principal;
    rows.push({ principal, interest });
  }
  return rows;
}

registerInterestModel('flat_monthly', {
  label: 'Lãi phẳng trên gốc ban đầu',
  rows: (m, ctx) => {
    const interest = roundMoney(ctx.principal * m.monthlyRate, ctx.rounding);
    return splitEven(ctx.principal, ctx.periods, ctx.rounding).map((principal) => ({ principal, interest }));
  },
  describe: (m) => `Lãi phẳng ${pct(m.monthlyRate)}/tháng`,
});

registerInterestModel('zero_interest', {
  label: 'Trả góp 0%',
  rows: (_m, ctx) => splitEven(ctx.principal, ctx.periods, ctx.rounding).map((principal) => ({ principal, interest: 0 })),
  describe: () => 'Lãi 0%',
});

registerInterestModel('reducing_balance', {
  label: 'Dư nợ giảm dần, trả đều',
  rows: (m, ctx) => {
    const r = m.annualRate / 12;
    return amortize(ctx, r, roundMoney(pmt(r, ctx.periods, ctx.principal), ctx.rounding), false);
  },
  describe: (m) => `Dư nợ giảm dần ${pct(m.annualRate, 1)}/năm, trả đều`,
});

registerInterestModel('reducing_equal_principal', {
  label: 'Gốc đều, lãi giảm dần',
  rows: (m, ctx) => {
    const r = m.annualRate / 12;
    let balance = ctx.principal;
    return splitEven(ctx.principal, ctx.periods, ctx.rounding).map((principal) => {
      const interest = roundMoney(balance * r, ctx.rounding);
      balance -= principal;
      return { principal, interest };
    });
  },
  describe: (m) => `Gốc đều, lãi ${pct(m.annualRate, 1)}/năm trên dư nợ`,
});

registerInterestModel('fixed_installment', {
  label: 'Biết số tiền mỗi kỳ (tự suy lãi)',
  rows: (m, ctx) => {
    const r = rate(ctx.periods, m.installment, ctx.principal);
    return amortize(ctx, Number.isFinite(r) && r > 0 ? r : 0, m.installment, true);
  },
  describe: (m) => `Mỗi kỳ cố định ${m.installment.toLocaleString('vi-VN')}`,
});

registerInterestModel('custom_schedule', {
  label: 'Bảng kỳ hạn nhập tay',
  rows: (m) => m.rows.map((r) => ({ principal: r.principal, interest: r.interest })),
  describe: (m) => `Bảng nhập tay (${m.rows.length} kỳ)`,
});
