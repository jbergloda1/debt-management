import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { migrate } from '../../src/domain/migrations';

// Dữ liệu v4: thẻ Sacombank "sao kê 10, hạn ngày 5", tối thiểu chưa nhập; trả góp VIB chưa có tiền thực nhận
const v4 = () => {
  const s = structuredClone(appendixA) as any;
  s.schemaVersion = 4;
  s.profile.schemaVersion = 4;
  const sac = s.obligations.find((o: any) => o.id === 'card-sac');
  sac.dueRule = { type: 'statement_fixed_due', statementDay: 10, dueDay: 5 };
  delete sac.minimumPayment;
  delete s.obligations.find((o: any) => o.id === 'vib-1').netDisbursed;
  const st = s.statements.find((x: any) => x.id === 'st-sac-2610');
  st.dueDate = '2026-11-05';
  delete st.minimumDue;
  return s;
};

describe('migration v5 — theo sao kê thật', () => {
  it('Sacombank: hạn = sao kê + 25 ngày, tối thiểu 3%; VIB: phí chuyển đổi trả góp vào gốc', () => {
    const { state, from } = migrate(v4());
    expect(from).toBe(4);
    const ob = (id: string) => state.obligations.find((o) => o.id === id) as any;
    expect(ob('card-sac').dueRule).toEqual({ type: 'statement_offset', statementDay: 10, daysAfterStatement: 25 });
    expect(ob('card-sac').minimumPayment).toEqual({ percentOfStatement: 0.03, includeInstallmentsInFull: false });
    expect(state.statements.find((x) => x.id === 'st-sac-2610')!.dueDate).toBe('2026-11-04');
    expect(ob('vib-1').netDisbursed).toBe(15885013);
  });

  it('không đụng thẻ đã tự sửa quy tắc / tối thiểu', () => {
    const s = v4();
    const sac = s.obligations.find((o: any) => o.id === 'card-sac');
    sac.dueRule = { type: 'statement_fixed_due', statementDay: 10, dueDay: 4 };
    sac.minimumPayment = { percentOfStatement: 0.05, includeInstallmentsInFull: true };
    const { state } = migrate(s);
    const ob = state.obligations.find((o) => o.id === 'card-sac') as any;
    expect(ob.dueRule.dueDay).toBe(4);
    expect(ob.minimumPayment.percentOfStatement).toBe(0.05);
    expect(state.statements.find((x) => x.id === 'st-sac-2610')!.dueDate).toBe('2026-11-05');
  });
});
