import { addDays, monthOf, monthRange } from './dates';
import { dueItemsForMonth, outstandingOf } from './dueItems';
import type { Engine } from './engine';
import { formatMoney } from './money';
import type { ISODate } from './types';

/** Escape theo RFC 5545 (TEXT). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Gập dòng dài hơn 75 octet (UTF-8), không cắt giữa ký tự. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // dòng tiếp theo bắt đầu bằng 1 dấu cách
    if (size + n > limit) {
      parts.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compact = (d: ISODate) => d.replace(/-/g, '');

/**
 * Lịch .ics các khoản chưa trả trong `months` tháng, mỗi khoản một sự kiện cả ngày kèm báo thức
 * lúc 9:00 trước hạn theo settings.reminderDaysBefore (và đúng ngày). Nhập vào Google Calendar / lịch iPhone
 * để được nhắc ngay cả khi không mở app.
 */
export function buildIcs(engine: Engine, fromMonth: string, months: number, now: Date = new Date()): string {
  const { currency, locale, name } = engine.state.profile;
  const offsets = [...new Set([...engine.state.profile.settings.reminderDaysBefore, 0])].filter((d) => d >= 0);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const seen = new Set<string>();
  const items = monthRange(fromMonth, months)
    .flatMap((m) => dueItemsForMonth(engine, m))
    .filter((it) => !it.includedIn && outstandingOf(it) > 0 && monthOf(it.dueDate) >= fromMonth && !seen.has(it.key) && seen.add(it.key));

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Debt Manager//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`Trả nợ · ${name}`)}`];
  for (const it of items) {
    const ob = engine.obligation(it.obligationId);
    const money = formatMoney(outstandingOf(it), currency, locale);
    const children = dueItemsForMonth(engine, monthOf(it.dueDate)).filter((c) => c.includedIn === it.obligationId);
    const desc = [
      `${it.label}: ${money}`,
      ...children.map((c) => `Gồm ${engine.obligation(c.obligationId)?.name ?? ''} ${c.label}`),
      ob?.dueDateEstimated ? 'Ngày đến hạn là tạm tính' : '',
    ].filter(Boolean);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.key.replace(/[^\w:-]/g, '_')}@debt-manager`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(it.dueDate)}`,
      `DTEND;VALUE=DATE:${compact(addDays(it.dueDate, 1))}`,
      `SUMMARY:${esc(`Trả ${ob?.name ?? it.label}: ${money}`)}`,
      `DESCRIPTION:${esc(desc.join('\n'))}`,
      'TRANSP:TRANSPARENT',
    );
    for (const d of offsets.sort((a, b) => b - a)) {
      // Sự kiện cả ngày bắt đầu 00:00 → báo lúc 9:00 của ngày (hạn − d)
      const hours = d * 24 - 9;
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`${ob?.name ?? it.label} ${d === 0 ? 'đến hạn hôm nay' : `đến hạn sau ${d} ngày`}`)}`,
        `TRIGGER;RELATED=START:${hours > 0 ? '-' : ''}PT${Math.abs(hours)}H`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
