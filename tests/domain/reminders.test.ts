import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine } from '../../src/domain/engine';
import { buildIcs, foldLine } from '../../src/domain/ics';
import { markShown, reminderSchedule, remindersDue } from '../../src/domain/reminders';
import type { ProfileState } from '../../src/domain/types';

const today = '2026-11-04';
const engine = createEngine(appendixA, today); // nhắc trước [5, 1] ngày

describe('lịch nhắc', () => {
  const queue = reminderSchedule(engine, today, '2026-12-09');

  it('mốc nhắc theo reminderDaysBefore + đúng ngày; bỏ khoản nằm trong sao kê', () => {
    const sac = queue.filter((r) => r.obligationId === 'card-sac').map((r) => [r.date, r.daysBefore]);
    expect(sac).toEqual([
      ['2026-11-03', 1],
      ['2026-11-04', 0],
    ]); // mốc trước 5 ngày (30/10) đã quá STALE_DAYS
    expect(queue.filter((r) => r.obligationId === 'shf-1').map((r) => r.date)).toEqual(['2026-11-10', '2026-11-14', '2026-11-15']);
    expect(queue.some((r) => r.obligationId === 'vib-1')).toBe(false);
    expect(queue.find((r) => r.obligationId === 'card-vib')!.body).toContain('7.246.783');
  });

  it('hôm nay nhắc thẻ Sacombank (hạn hôm nay) và thẻ VIB (hạn 09/11, mốc trước 5 ngày)', () => {
    const due = remindersDue(queue, today, []);
    expect(due.map((r) => r.title)).toEqual(['Thẻ Sacombank đến hạn hôm nay', 'Thẻ VIB đến hạn sau 5 ngày']);
    expect(due[0].body.replace(/ /g, ' ')).toBe('Sao kê 10/10 · 8.366.746 ₫ · hạn 04/11/2026');
  });

  it('không nhắc lại; mở app muộn chỉ hiện mốc gần nhất', () => {
    const shown = markShown(queue, [], remindersDue(queue, today, []));
    expect(remindersDue(queue, today, shown)).toEqual([]);
    // Mở app ngày 15/11: Shinhan 1 có mốc 10/11, 14/11, 15/11 → chỉ hiện "hôm nay"
    const later = remindersDue(queue, '2026-11-15', shown).filter((r) => r.obligationId === 'shf-1');
    expect(later.map((r) => r.daysBefore)).toEqual([0]);
    const shown2 = markShown(queue, shown, later);
    expect(remindersDue(queue, '2026-11-15', shown2).filter((r) => r.obligationId === 'shf-1')).toEqual([]);
  });

  it('đã trả thì không nhắc; quá hạn thì nhắc một lần', () => {
    const paid: ProfileState = {
      ...appendixA,
      payments: [{ id: 'p', obligationId: 'card-sac', dueItemKey: 'card-sac:st-sac-2610', date: today, amount: 8366746 }],
    };
    expect(reminderSchedule(createEngine(paid, today), today, '2026-11-30').some((r) => r.obligationId === 'card-sac')).toBe(false);

    const late = reminderSchedule(createEngine(appendixA, '2026-11-07'), '2026-11-07', '2026-11-30').filter((r) => r.obligationId === 'card-sac');
    expect(late.map((r) => [r.key, r.date, r.title])).toEqual([['card-sac:st-sac-2610@overdue', '2026-11-07', 'Thẻ Sacombank đã quá hạn 3 ngày']]);
  });
});

describe('file lịch .ics', () => {
  const ics = buildIcs(engine, '2026-11', 2, new Date('2026-11-04T03:00:00Z'));
  const events = ics.split('BEGIN:VEVENT').slice(1);

  it('một sự kiện cho mỗi khoản chưa trả, báo thức 9:00 trước hạn', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    // tháng 11: thẻ Sac, thẻ VIB, Shinhan 1, Vay 1–3, SFinance; tháng 12: Vay 3–4, VIB? (chưa có sao kê), Shinhan 1–2, SFinance
    expect(events.length).toBe(7 + 5);
    const sac = events.find((e) => e.includes('UID:card-sac:st-sac-2610@debt-manager'))!;
    expect(sac).toContain('DTSTART;VALUE=DATE:20261104');
    expect(sac).toContain('TRIGGER;RELATED=START:-PT111H'); // 5 ngày trước, 9:00
    expect(sac).toContain('TRIGGER;RELATED=START:-PT15H'); // 1 ngày trước, 9:00
    expect(sac).toContain('TRIGGER;RELATED=START:PT9H'); // đúng ngày, 9:00
    const vib = events.find((e) => e.includes('UID:card-vib'))!;
    expect(vib.replace(/\r\n /g, '')).toContain('Gồm Trả góp VIB Kỳ 1/9');
  });

  it('dòng không quá 75 octet, escape ký tự đặc biệt', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(foldLine('a'.repeat(80))).toBe(`${'a'.repeat(75)}\r\n ${'a'.repeat(5)}`);
    expect(foldLine('ạ'.repeat(30)).split('\r\n')[0]).toBe('ạ'.repeat(25)); // 3 byte/ký tự
  });
});
