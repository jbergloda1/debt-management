/** PMT: số tiền trả đều mỗi kỳ. */
export const pmt = (r: number, n: number, pv: number) => (r === 0 ? pv / n : (pv * r) / (1 - (1 + r) ** -n));

/**
 * IRR theo kỳ: r sao cho pv = Σ flows[k] / (1+r)^(k+1).
 * Newton–Raphson, fallback bisection khi không hội tụ (Phụ lục B).
 */
export function irr(pv: number, flows: number[], guess = 0.01): number {
  if (pv <= 0 || flows.length === 0) return NaN;
  const total = flows.reduce((s, x) => s + x, 0);
  if (Math.abs(total - pv) < 1e-9) return 0;
  if (total < pv) return NaN; // trả ít hơn số vay — không có lãi dương

  const f = (r: number) => flows.reduce((s, x, k) => s + x * (1 + r) ** -(k + 1), 0) - pv;
  const df = (r: number) => flows.reduce((s, x, k) => s - (k + 1) * x * (1 + r) ** -(k + 2), 0);

  let r = guess;
  for (let i = 0; i < 100; i++) {
    const next = r - f(r) / df(r);
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  // f giảm theo r: f(lo) > 0 > f(hi)
  let lo = 1e-12;
  let hi = 1;
  while (f(hi) > 0 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** RATE của Excel: lãi mỗi kỳ sao cho pv = pmt × (1 − (1+r)^−n) / r. */
export const rate = (n: number, payment: number, pv: number): number =>
  n > 0 && payment > 0 ? irr(pv, Array(n).fill(payment)) : NaN;

/** Lãi hiệu dụng năm từ lãi tháng. */
export const ear = (monthlyRate: number) => (1 + monthlyRate) ** 12 - 1;
