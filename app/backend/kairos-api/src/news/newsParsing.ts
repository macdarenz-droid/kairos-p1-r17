/**
 * P34: reading an official source into small, plain values: text with no markup, iCalendar events, a wall time in a
 * time zone as a UTC instant, and a stable key per event. Pure; the routes decide nothing else with it.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
});
const ENTITY = /&(#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g;
const CDATA = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/;

function decodeEntity(whole: string, body: string): string {
  if (body.startsWith('#')) {
    const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
  }
  return NAMED_ENTITIES[body] ?? whole;
}

/** Plain text from a source's text: entities decoded once, tags and control characters gone, spaces collapsed; null unless 1 to maxLength characters. Never cut. */
export function normaliseNewsText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  const cdata = CDATA.exec(raw);
  const text = (cdata === null ? raw : cdata[1])
    .replace(ENTITY, decodeEntity)
    .replace(/<[^>]*>/g, ' ')
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
  const memo = new Map<string, number>();
  const noonOffset = (y: number, m: number, d: number): number => {
    const key = `${y}-${m}-${d}`;
    let offset = memo.get(key);
    if (offset === undefined) { const noon = Date.UTC(y, m - 1, d, 12); offset = localOf(noon) - noon; memo.set(key, offset); }
    return offset;
  };
  // A month without a clock change has one offset; only a month with a change is read day by day.
  const dayOffset = (y: number, m: number, d: number): number => {
    const first = noonOffset(y, m, 1), next = m === 12 ? noonOffset(y + 1, 1, 1) : noonOffset(y, m + 1, 1);
    return first === next ? first : noonOffset(y, m, d);
  };
  return (dateKey, clock) => {
    const date = DATE_KEY.exec(dateKey);
    const time = CLOCK.exec(clock);
    if (date === null || time === null) return null;
    const [y, m, d, hour, minute] = [date[1], date[2], date[3], time[1], time[2]].map(Number);
    const wall = Date.UTC(y, m - 1, d, hour, minute);
    if (new Date(wall).toISOString().slice(0, 16) !== `${dateKey}T${clock}`) return null;
    // These zones change clocks only between 01:00 and 03:00.
    if (hour >= 4) return new Date(wall - dayOffset(y, m, d)).toISOString();
    const guess = wall - (localOf(wall) - wall);
    const at = wall - (localOf(guess) - guess);
    return localOf(at) === wall ? new Date(at).toISOString() : null;
  };
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit over the UTF-8 bytes, as 16 lowercase hex characters. */
export function fnv1a64Hex(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  return hash.toString(16).padStart(16, '0');
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
