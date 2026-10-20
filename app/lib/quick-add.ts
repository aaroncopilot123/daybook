import {
  addDays,
  addMonths,
  isDate,
  localDate,
  normalizeRecurrence,
  weekday,
  type Project,
  type Recurrence,
} from "./tasks";

// Typed quick-add: dates, repeats, #project and p1–p4 recognised inside a task title.

export type TitleToken = { start: number; end: number; text: string } & (
  | { kind: "date"; date: string }
  | { kind: "repeat"; recurrence: Recurrence }
  | { kind: "project"; projectId: string; name: string }
  | { kind: "priority"; priority: 1 | 2 | 3 | 4 }
);
export type TokenKind = TitleToken["kind"];

export type ParseOptions = {
  projects?: Project[];
  // Injectable so parsing never depends on the real clock in checks.
  today?: string;
  // 26/10 vs 10/26; defaults to the browser locale.
  dayFirst?: boolean;
};

const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
// Bare "sun" is too common in ordinary text ("sun cream"); "sunday", "next sun" and "every sun" still work.
const DAY_WORDS = Object.keys(WEEKDAY_WORDS).filter((word) => word !== "sun");
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const SIMPLE_REPEATS: Record<string, Recurrence> = {
  daily: { interval: 1, unit: "day" },
  everyday: { interval: 1, unit: "day" },
  weekly: { interval: 1, unit: "week" },
  monthly: { interval: 1, unit: "month" },
  yearly: { interval: 1, unit: "year" },
  annually: { interval: 1, unit: "year" },
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
// "wks", "mos" and "yrs" are the plural "s" on top of these.
const UNIT_WORDS: Record<string, Recurrence["unit"]> = {
  day: "day",
  week: "week",
  wk: "week",
  month: "month",
  mth: "month",
  mo: "month",
  year: "year",
  yr: "year",
};

const alternation = (words: string[]) =>
  [...words].sort((a, b) => b.length - a.length).join("|");
const WEEKDAY = alternation(Object.keys(WEEKDAY_WORDS));
const DAY = `(?:${WEEKDAY})s?`;
const MONTH = alternation(Object.keys(MONTHS));
const ORDINAL = "(?:st|nd|rd|th)?";
const NUMBER_WORD = alternation(Object.keys(NUMBER_WORDS));
const UNIT = alternation(Object.keys(UNIT_WORDS));
// A count of units ahead: "2", "two", or "a"/"an" for one.
const AHEAD = `[1-9]\\d?|an?|${NUMBER_WORD}`;

// A token must stand alone: not inside a word, a URL path, an email, a time or a contraction.
const START = "(?<![\\p{L}\\p{N}_@#/.:'’-])";
const END = "(?![\\p{L}\\p{N}_]|[@#/.:'’-][\\p{L}\\p{N}])";
const OPAQUE = /\b(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[^\s@]+/giu;

const PRIORITY_PATTERN = "(?<priority>p[1-4])";
const REPEAT_PATTERN = `(?<repeat>${[
  `(?<simple>${alternation(Object.keys(SIMPLE_REPEATS))})`,
  `every\\s+(?:(?<other>other)\\s+|(?<count>\\d{1,2}|${NUMBER_WORD})\\s+)?(?<unit>${UNIT})s?`,
  "every\\s+(?<span>weekday|weekend)s?",
  `every\\s+(?:(?<daysOther>other)\\s+)?(?<days>${DAY}(?:\\s*(?:,\\s*(?:and\\s+)?|and\\s+|&\\s*)${DAY})*)`,
].join("|")})`;
const DATE_PATTERN = `(?<date>${[
  `in\\s+(?<inN>${AHEAD})\\s+(?<inUnit>${UNIT})s?`,
  `(?<laterN>${AHEAD})\\s+(?<laterUnit>${UNIT})s?\\s+(?:later|from\\s+now)`,
  "(?<dayAfter>(?:the\\s+)?day\\s+after\\s+(?:tomorrow|tmr))",
  // Before the bare weekday, so "friday next week" isn't read as "friday".
  `(?<weekOfDay>${WEEKDAY})\\s+next\\s+week`,
  "next\\s+(?<nextSpan>weekend|week|month)",
  `next\\s+(?<nextDay>${WEEKDAY})`,
  "this\\s+(?<weekend>weekend)",
  `(?<mdM>${MONTH})\\s+(?<mdD>\\d{1,2})${ORDINAL}(?:,?\\s+(?<mdY>\\d{4}))?`,
  `(?<dmD>\\d{1,2})${ORDINAL}(?:\\s+of)?\\s+(?<dmM>${MONTH})(?:,?\\s+(?<dmY>\\d{4}))?`,
  "(?<numA>\\d{1,2})/(?<numB>\\d{1,2})(?:/(?<numY>\\d{4}|\\d{2}))?",
  `(?<word>${alternation(["today", "tod", "tomorrow", "tmr", ...DAY_WORDS])})`,
].join("|")})`;

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
// "Side Hustle" can be typed as #side hustle, #Side-Hustle or #side_hustle.
const projectKey = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, " ").trim();

const patternCache = new Map<string, RegExp>();
function tokenPattern(projects: Project[]) {
  const names = projects
    .map((project) => project.name.trim())
    .filter((name) => name && !/^\d+$/.test(name))
    .sort((a, b) => b.length - a.length);
  const cacheKey = names.join("\u0000");
  let pattern = patternCache.get(cacheKey);
  if (!pattern) {
    const project = names.length
      ? `#(?<project>${names.map((name) => name.split(/\s+/).map(escapeRegExp).join("[\\s_-]+")).join("|")})`
      : null;
    // At the same position: project, then priority, then repeat, then date.
    const kinds = [project, PRIORITY_PATTERN, REPEAT_PATTERN, DATE_PATTERN].filter(Boolean);
    pattern = new RegExp(`${START}(?:${kinds.join("|")})${END}`, "giu");
    patternCache.set(cacheKey, pattern);
  }
  return new RegExp(pattern.source, pattern.flags);
}

let localeDayFirst: boolean | undefined;
export function dayFirstLocale() {
  if (localeDayFirst === undefined) {
    const parts = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "numeric",
    }).formatToParts(new Date(2026, 9, 26));
    localeDayFirst =
      parts.findIndex((part) => part.type === "day") <
      parts.findIndex((part) => part.type === "month");
  }
  return localeDayFirst;
}

const pad = (value: number) => String(value).padStart(2, "0");

// A date without a year is the next time it comes round, from today.
function calendarDate(month: number, day: number, year: string | undefined, today: string) {
  if (year) {
    const full = year.length === 2 ? 2000 + Number(year) : Number(year);
    const value = `${full}-${pad(month)}-${pad(day)}`;
    return isDate(value) ? value : null;
  }
  const thisYear = Number(today.slice(0, 4));
  for (let offset = 0; offset <= 4; offset++) {
    const value = `${thisYear + offset}-${pad(month)}-${pad(day)}`;
    if (isDate(value) && value >= today) return value;
  }
  return null;
}

// The coming Saturday, or today's weekend if it is already Saturday or Sunday.
function thisWeekend(today: string) {
  const day = weekday(today);
  return day === 6 || day === 0 ? today : addDays(today, 6 - day);
}

function nextWeekdayFrom(today: string, day: number) {
  return addDays(today, (day - weekday(today) + 7) % 7 || 7);
}

type Groups = Record<string, string | undefined>;

function countOf(text: string) {
  const word = text.toLowerCase();
  if (word === "a" || word === "an") return 1;
  return NUMBER_WORDS[word] ?? Number(word);
}

function repeatFromGroups(groups: Groups): Recurrence | null {
  if (groups.simple) return SIMPLE_REPEATS[groups.simple.toLowerCase()];
  if (groups.unit)
    return normalizeRecurrence({
      interval: groups.other ? 2 : countOf(groups.count ?? "1"),
      unit: UNIT_WORDS[groups.unit.toLowerCase()],
    });
  if (groups.span)
    return {
      interval: 1,
      unit: "week",
      weekdays: groups.span.toLowerCase() === "weekday" ? [1, 2, 3, 4, 5] : [0, 6],
    };
  if (groups.days)
    return normalizeRecurrence({
      interval: groups.daysOther ? 2 : 1,
      unit: "week",
      weekdays: groups.days
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((word) => word && word !== "and")
        .map((word) => WEEKDAY_WORDS[word] ?? WEEKDAY_WORDS[word.slice(0, -1)]),
    });
  return null;
}

function dateFromGroups(groups: Groups, today: string, dayFirst: boolean): string | null {
  const aheadUnit = groups.inUnit ?? groups.laterUnit;
  if (aheadUnit) {
    const n = countOf((groups.inN ?? groups.laterN)!);
    const unit = UNIT_WORDS[aheadUnit.toLowerCase()];
    if (unit === "day") return addDays(today, n);
    if (unit === "week") return addDays(today, 7 * n);
    return addMonths(today, unit === "month" ? n : 12 * n);
  }
  if (groups.dayAfter) return addDays(today, 2);
  if (groups.weekOfDay) {
    // Weeks start on Monday, as in "next week", so "sunday next week" ends that week.
    const monday = nextWeekdayFrom(today, 1);
    return addDays(monday, (WEEKDAY_WORDS[groups.weekOfDay.toLowerCase()] + 6) % 7);
  }
  if (groups.nextSpan) {
    const span = groups.nextSpan.toLowerCase();
    if (span === "week") return nextWeekdayFrom(today, 1);
    if (span === "weekend") {
      const day = weekday(today);
      // On a Sunday this weekend's Saturday was yesterday.
      const saturday = day === 0 ? addDays(today, -1) : thisWeekend(today);
      return addDays(saturday, 7);
    }
    return `${addMonths(`${today.slice(0, 7)}-01`, 1)}`;
  }
  if (groups.nextDay) return nextWeekdayFrom(today, WEEKDAY_WORDS[groups.nextDay.toLowerCase()]);
  if (groups.weekend) return thisWeekend(today);
  if (groups.mdM)
    return calendarDate(MONTHS[groups.mdM.toLowerCase()], Number(groups.mdD), groups.mdY, today);
  if (groups.dmM)
    return calendarDate(MONTHS[groups.dmM.toLowerCase()], Number(groups.dmD), groups.dmY, today);
  if (groups.numA) {
    // "1/2 cup" and "3/4" are fractions: a numeric date needs a two-digit part or a year.
    if (!groups.numY && groups.numA.length < 2 && groups.numB!.length < 2) return null;
    const [day, month] = dayFirst
      ? [groups.numA, groups.numB!]
      : [groups.numB!, groups.numA];
    if (Number(month) < 1 || Number(month) > 12) return null;
    return calendarDate(Number(month), Number(day), groups.numY, today);
  }
  if (groups.word) {
    const word = groups.word.toLowerCase();
    if (word === "today" || word === "tod") return today;
    if (word === "tomorrow" || word === "tmr") return addDays(today, 1);
    return nextWeekdayFrom(today, WEEKDAY_WORDS[word]);
  }
  return null;
}

// Every recognised token in a title: the last valid match of each kind, in title order.
export function parseTitle(text: string, options: ParseOptions = {}): TitleToken[] {
  const projects = options.projects ?? [];
  const today = options.today ?? localDate();
  const dayFirst = options.dayFirst ?? dayFirstLocale();
  const opaque = [...text.matchAll(OPAQUE)].map(
    (match) => [match.index, match.index + match[0].length] as const,
  );
  const latest = new Map<TokenKind, TitleToken>();
  for (const match of text.matchAll(tokenPattern(projects))) {
    const start = match.index;
    const end = start + match[0].length;
    if (opaque.some(([from, to]) => start < to && end > from)) continue;
    const span = { start, end, text: match[0] };
    const groups = match.groups ?? {};
    let token: TitleToken | null = null;
    if (groups.project) {
      const key = projectKey(groups.project);
      const project = projects.find((item) => projectKey(item.name) === key);
      if (project) token = { ...span, kind: "project", projectId: project.id, name: project.name };
    } else if (groups.priority) {
      token = { ...span, kind: "priority", priority: Number(groups.priority[1]) as 1 | 2 | 3 | 4 };
    } else if (groups.repeat) {
      const recurrence = repeatFromGroups(groups);
      if (recurrence) token = { ...span, kind: "repeat", recurrence };
    } else if (groups.date) {
      const date = dateFromGroups(groups, today, dayFirst);
      if (date) token = { ...span, kind: "date", date };
    }
    if (token) latest.set(token.kind, token);
  }
  return [...latest.values()].sort((a, b) => a.start - b.start);
}

// Stable identity for dismissing a token: its kind plus the words typed.
export const tokenKey = (token: TitleToken) => `${token.kind}:${token.text.toLowerCase()}`;

export function tokenOf<K extends TokenKind>(tokens: TitleToken[], kind: K) {
  return tokens.find((token) => token.kind === kind) as
    | Extract<TitleToken, { kind: K }>
    | undefined;
}

// The title with recognised tokens taken out.
export function stripTokens(text: string, tokens: TitleToken[]) {
  let result = text;
  for (const token of [...tokens].sort((a, b) => b.start - a.start))
    result = `${result.slice(0, token.start)} ${result.slice(token.end)}`;
  return result.replace(/\s+/g, " ").trim();
}
