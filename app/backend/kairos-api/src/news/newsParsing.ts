/**
 * P34: reading an official source into small, plain values: text with no markup, iCalendar events, a wall time in a
 * time zone as a UTC instant, and a stable key per event. Pure; the routes decide nothing else with it.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
});
const ENTITY = /&(#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g;
const CDATA_SECTION = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

function decodeEntity(whole: string, body: string): string {
  if (body.startsWith('#')) {
    const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
  }
  return NAMED_ENTITIES[body] ?? whole;
}

/** Words already plain: no entity, tag or control character, and single spaces only between them. */
const PLAIN = /^[^&<\u0000-\u001f\u007f\s]+(?: [^&<\u0000-\u001f\u007f\s]+)*$/;

/** Plain text from a source's text: outside CDATA entities decoded once and tags gone; control characters gone, spaces collapsed; null unless 1 to maxLength characters. Never cut. */
export function normaliseNewsText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  // Most titles are already plain, and the steps below would give them back unchanged.
  if (raw.length <= maxLength && PLAIN.test(raw)) return raw;
  // Inside CDATA the text is kept as written (no entity decoding, no tag stripping); sections join with nothing between.
  const markupOutside = (part: string): string => part.replace(ENTITY, decodeEntity).replace(/<[^>]*>/g, ' ');
  let joined = '';
  let from = 0;
  for (const section of raw.matchAll(CDATA_SECTION)) {
    joined += markupOutside(raw.slice(from, section.index)) + section[1];
    from = section.index + section[0].length;
  }
  const text = (joined + markupOutside(raw.slice(from)))
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length >= 1 && text.length <= maxLength ? text : null;
}

export interface IcsEvent {
  readonly summary: string | null;
  readonly dtstart: Readonly<{ params: string; value: string }> | null;
}

const unescapeIcs = (value: string): string => value.replace(/\\([,;\\nN])/g, (_whole, char: string) => (char === 'n' || char === 'N' ? ' ' : char));

/** The events of an iCalendar file (summary and start only); null when the text is not an iCalendar file. */
export function readIcsEvents(text: string): readonly IcsEvent[] | null {
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) return null;
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n').map((line) => line.trimEnd());
  const events: IcsEvent[] = [];
  let current: { summary: string | null; dtstart: { params: string; value: string } | null } | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = { summary: null, dtstart: null }; continue; }
    if (current === null) continue;
    if (line === 'END:VEVENT') {
      events.push(Object.freeze({ summary: current.summary, dtstart: current.dtstart === null ? null : Object.freeze(current.dtstart) }));
      current = null;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    if (line.startsWith('SUMMARY:') || line.startsWith('SUMMARY;')) current.summary = unescapeIcs(line.slice(colon + 1));
    else if (line.startsWith('DTSTART:') || line.startsWith('DTSTART;')) current.dtstart = { params: line.slice('DTSTART'.length, colon), value: line.slice(colon + 1).trim() };
  }
  return Object.freeze(events);
}

/** How many wall times every zoned clock has converted: a test hook that proves days outside a window are never converted. */
export const zonedClockUse = { conversions: 0 };

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{2}):(\d{2})$/;

/**
 * A wall time (YYYY-MM-DD, HH:MM) in a time zone as a UTC instant; null for a date or time that does not exist there.
 * One formatter per clock, and one offset per month without a clock change: formatToParts costs about 10 µs and the
 * Free plan allows 10 ms of CPU per call.
 */
export function createZonedClock(timeZone: string): (dateKey: string, clock: string) => string | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return () => null;
  }
  const localOf = (at: number): number => {
    const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
    for (const { type, value } of format.formatToParts(new Date(at))) part[type] = value;
    return Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute), Number(part.second));
  };
  const memo = new Map<number, number>();
  const noonOffset = (y: number, m: number, d: number): number => {
    const key = y * 10_000 + m * 100 + d;
    let offset = memo.get(key);
    if (offset === undefined) { const noon = Date.UTC(y, m - 1, d, 12); offset = localOf(noon) - noon; memo.set(key, offset); }
    return offset;
  };
  // A month without a clock change has one offset (kept per month, NaN for a month with a change, which is read day by day).
  const monthMemo = new Map<number, number>();
  const dayOffset = (y: number, m: number, d: number): number => {
    const key = y * 100 + m;
    let offset = monthMemo.get(key);
    if (offset === undefined) {
      const first = noonOffset(y, m, 1), next = m === 12 ? noonOffset(y + 1, 1, 1) : noonOffset(y, m + 1, 1);
      offset = first === next ? first : Number.NaN;
      monthMemo.set(key, offset);
    }
    return Number.isNaN(offset) ? noonOffset(y, m, d) : offset;
  };
  return (dateKey, clock) => {
    zonedClockUse.conversions += 1;
    const date = DATE_KEY.exec(dateKey);
    const time = CLOCK.exec(clock);
    if (date === null || time === null) return null;
    const y = Number(date[1]), m = Number(date[2]), d = Number(date[3]), hour = Number(time[1]), minute = Number(time[2]);
    // Only a real date and time: Date.UTC reads years 0 to 99 as 1900 to 1999 and rolls every other part over.
    if (y < 100 || m < 1 || m > 12 || d < 1 || hour > 23 || minute > 59) return null;
    const wall = Date.UTC(y, m - 1, d, hour, minute);
    if (d > 28 && new Date(wall).getUTCDate() !== d) return null;
    // These zones change clocks only between 01:00 and 03:00.
    if (hour >= 4) return new Date(wall - dayOffset(y, m, d)).toISOString();
    const guess = wall - (localOf(wall) - wall);
    const at = wall - (localOf(guess) - guess);
    return localOf(at) === wall ? new Date(at).toISOString() : null;
  };
}

const UTF8 = new TextEncoder();
const TWO_32 = 4_294_967_296;

/**
 * FNV-1a 64-bit over the UTF-8 bytes, as 16 lowercase hex characters. The hash is kept as two 32-bit halves: BigInt
 * cost about 7 ms of CPU for the Fed's calendar, and the Free plan allows 10 ms per call. The prime is 2^40 + 0x1b3.
 */
export function fnv1a64Hex(text: string): string {
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  for (const byte of UTF8.encode(text)) {
    low = (low ^ byte) >>> 0;
    const product = low * 0x1b3; // below 2^41: exact
    high = (Math.imul(high, 0x1b3) + (low << 8) + Math.floor(product / TWO_32)) >>> 0;
    low = product >>> 0;
  }
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}

/** The stable key of one event: the same source, title and time give the same key on every read. */
export function newsEventKey(source: string, title: string, startsAt: string): string {
  return fnv1a64Hex(`${source}|${title}|${startsAt}`);
}

export interface RssItem {
  readonly title: string | null;
  readonly link: string | null;
  readonly date: string | null;
  readonly publisher: string | null;
}

/** The inner text of an element's first appearance; the name must end there, so `link` never matches `<linkHistoric>`. */
function firstElement(body: string, name: string): string | null {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(body);
  return match === null ? null : match[1];
}

/** The items of an RSS 2.0 or RSS 1.0 (RDF) feed, each element's raw inner text; null when the text is not a feed. */
export function readRssItems(text: string): readonly RssItem[] | null {
  if (!text.includes('<rss') && !text.includes('<rdf:RDF')) return null;
  const items: RssItem[] = [];
  for (const [, body] of text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    items.push(Object.freeze({
      title: firstElement(body, 'title'),
      link: firstElement(body, 'link'),
      date: firstElement(body, 'pubDate') ?? firstElement(body, 'dc:date'),
      publisher: firstElement(body, 'source'),
    }));
  }
  return Object.freeze(items);
}
