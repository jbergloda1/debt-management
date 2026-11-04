import type { InterestModel, Money, RoundingPolicy } from '../../types';

export type ModelOf<T extends InterestModel['type']> = Extract<InterestModel, { type: T }>;

export interface InterestContext {
  principal: Money;
  periods: number;
  rounding: RoundingPolicy;
}

export interface InterestModelStrategy<M extends InterestModel = InterestModel> {
  label: string;
  /** Gốc & lãi từng kỳ (chưa gồm phí). Tổng gốc phải đúng bằng principal. */
  rows(model: M, ctx: InterestContext): { principal: Money; interest: Money }[];
  describe(model: M): string;
}

const registry = new Map<string, InterestModelStrategy<any>>();

export function registerInterestModel<T extends InterestModel['type']>(type: T, s: InterestModelStrategy<ModelOf<T>>) {
  registry.set(type, s);
}

export function getInterestModel(type: string): InterestModelStrategy {
  const s = registry.get(type);
  if (!s) throw new Error(`Chưa đăng ký mô hình lãi: ${type}`);
  return s;
}

export const listInterestModels = () => [...registry.entries()].map(([type, s]) => ({ type, label: s.label }));
export const describeInterestModel = (m: InterestModel) => getInterestModel(m.type).describe(m);
