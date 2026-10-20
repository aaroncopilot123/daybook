import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayFirstLocale,
  parseTitle,
  stripTokens,
  tokenKey,
  tokenOf,
  type ParseOptions,
} from "../app/lib/quick-add";
import type { Project, Recurrence } from "../app/lib/tasks";

// A Tuesday. Every expectation below is relative to it unless a case passes its own `today`.
const TODAY = "2026-10-20";

const PROJECTS: Project[] = [
  { id: "work", name: "Work" },
  { id: "side", name: "Side" },
  { id: "side-hustle", name: "Side Hustle" },
  { id: "year", name: "2026" },
];

const parse = (text: string, options: ParseOptions = {}) =>
  parseTitle(text, { today: TODAY, dayFirst: true, projects: PROJECTS, ...options });

// The phrase must be recognised whole, not just a word inside it.
function expectWhole<K extends "date" | "repeat">(text: string, kind: K, options?: ParseOptions) {
  const token = tokenOf(parse(text, options), kind);
  expect(token, `"${text}" should be a ${kind}`).toMatchObject({ text });
  return token!;
}

const week = (interval: number, weekdays?: number[]): Recurrence =>
  weekdays ? { interval, unit: "week", weekdays } : { interval, unit: "week" };

describe("dates", () => {
  it.each([
    ["today", "2026-10-20"],
    ["tod", "2026-10-20"],
    ["tomorrow", "2026-10-21"],
    ["tmr", "2026-10-21"],
    ["day after tomorrow", "2026-10-22"],
    ["the day after tomorrow", "2026-10-22"],
    ["day after tmr", "2026-10-22"],
  ])("relative day %j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  it.each([
    ["monday", "2026-10-26"],
    ["mon", "2026-10-26"],
    // The same weekday as today means next week, never today.
    ["tuesday", "2026-10-27"],
    ["tue", "2026-10-27"],
    ["tues", "2026-10-27"],
    ["wednesday", "2026-10-21"],
    ["wed", "2026-10-21"],
    ["thursday", "2026-10-22"],
    ["thu", "2026-10-22"],
    ["thur", "2026-10-22"],
    ["thurs", "2026-10-22"],
    ["friday", "2026-10-23"],
    ["fri", "2026-10-23"],
    ["saturday", "2026-10-24"],
    ["sat", "2026-10-24"],
    ["sunday", "2026-10-25"],
  ])("weekday %j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  it("does not read a bare 'sun' as Sunday", () => {
    expect(parse("buy sun cream")).toEqual([]);
  });

  it.each([
    ["next sun", "2026-10-25"],
    ["next friday", "2026-10-23"],
    ["next tuesday", "2026-10-27"],
    ["next week", "2026-10-26"],
    ["next weekend", "2026-10-31"],
    ["this weekend", "2026-10-24"],
    ["next month", "2026-11-01"],
  ])("%j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  it.each([
    ["monday next week", "2026-10-26"],
    ["tuesday next week", "2026-10-27"],
    ["friday next week", "2026-10-30"],
    ["fri next week", "2026-10-30"],
    ["sun next week", "2026-11-01"],
    ["sunday next week", "2026-11-01"],
  ])("weekday of next week %j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  describe("around the weekend", () => {
    it.each([
      // Saturday
      ["this weekend", "2026-10-24", "2026-10-24"],
      ["next weekend", "2026-10-24", "2026-10-31"],
      // Sunday: this weekend is today, next weekend starts in six days.
      ["this weekend", "2026-10-25", "2026-10-25"],
      ["next weekend", "2026-10-25", "2026-10-31"],
      ["next week", "2026-10-25", "2026-10-26"],
      ["friday next week", "2026-10-25", "2026-10-30"],
      // Monday: next week is a week away, not today.
      ["next week", "2026-10-26", "2026-11-02"],
      ["monday next week", "2026-10-26", "2026-11-02"],
    ])("%j on %s → %s", (text, today, date) => {
      expect(expectWhole(text, "date", { today }).date).toBe(date);
    });
  });

  it.each([
    ["in 3 days", "2026-10-23"],
    ["in 1 day", "2026-10-21"],
    ["in a day", "2026-10-21"],
    ["in 12 days", "2026-11-01"],
    ["in 2 weeks", "2026-11-03"],
    ["in two weeks", "2026-11-03"],
    ["in a week", "2026-10-27"],
    ["in 2 wks", "2026-11-03"],
    ["in a month", "2026-11-20"],
    ["in 3 months", "2027-01-20"],
    ["in three mos", "2027-01-20"],
    ["in 6 mths", "2027-04-20"],
    ["in an year", "2027-10-20"],
    ["in 1 yr", "2027-10-20"],
    ["in 2 years", "2028-10-20"],
    ["in twelve days", "2026-11-01"],
  ])("in N units %j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  it.each([
    ["2 days later", "2026-10-22"],
    ["two days later", "2026-10-22"],
    ["a day later", "2026-10-21"],
    ["ten days later", "2026-10-30"],
    ["a week later", "2026-10-27"],
    ["3 wks later", "2026-11-10"],
    ["3 months from now", "2027-01-20"],
    ["a year from now", "2027-10-20"],
    ["2 yrs from now", "2028-10-20"],
  ])("N units later %j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  it.each([
    ["in a month", "2026-01-31", "2026-02-28"],
    ["in a month", "2028-01-31", "2028-02-29"],
    ["2 months later", "2026-12-31", "2027-02-28"],
    ["in a year", "2028-02-29", "2029-02-28"],
  ])("clamps %j from %s to the shorter month → %s", (text, today, date) => {
    expect(expectWhole(text, "date", { today }).date).toBe(date);
  });

  it.each([
    ["oct 26", "2026-10-26"],
    ["October 26", "2026-10-26"],
    ["oct 26th", "2026-10-26"],
    // Today still counts; a date already gone this year means next year.
    ["oct 20", "2026-10-20"],
    ["oct 19", "2027-10-19"],
    ["jan 5", "2027-01-05"],
    ["sept 1", "2027-09-01"],
    ["nov 3rd, 2027", "2027-11-03"],
    ["nov 3 2027", "2027-11-03"],
    ["26th of october", "2026-10-26"],
    ["26 oct", "2026-10-26"],
    ["1st nov", "2026-11-01"],
    ["3 nov 2027", "2027-11-03"],
    ["2nd of may, 2028", "2028-05-02"],
    // A leap day without a year is the next one.
    ["feb 29", "2028-02-29"],
  ])("month and day %j → %s", (text, date) => {
    expect(expectWhole(text, "date").date).toBe(date);
  });

  it.each(["feb 30", "feb 29 2027", "april 31"])("rejects the impossible date %j", (text) => {
    expect(tokenOf(parse(text), "date")).toBeUndefined();
  });

  describe("numeric dates", () => {
    it.each([
      ["26/10", true, "2026-10-26"],
      ["10/26", false, "2026-10-26"],
      ["05/11", true, "2026-11-05"],
      ["05/11", false, "2027-05-11"],
      ["12/1", true, "2027-01-12"],
      ["1/2/27", true, "2027-02-01"],
      ["3/4/2027", false, "2027-03-04"],
      ["31/12/2026", true, "2026-12-31"],
    ])("%j with dayFirst=%s → %s", (text, dayFirst, date) => {
      expect(expectWhole(text, "date", { dayFirst }).date).toBe(date);
    });

    it.each([
      ["1/2 cup flour", true],
      ["3/4", false],
      ["26/10", false],
      ["13/13", true],
      ["31/02/2027", true],
    ])("ignores %j with dayFirst=%s", (text, dayFirst) => {
      expect(tokenOf(parse(text, { dayFirst }), "date")).toBeUndefined();
    });
  });
});

describe("repeats", () => {
  it.each<[string, Recurrence]>([
    ["daily", { interval: 1, unit: "day" }],
    ["everyday", { interval: 1, unit: "day" }],
    ["weekly", week(1)],
    ["monthly", { interval: 1, unit: "month" }],
    ["yearly", { interval: 1, unit: "year" }],
    ["annually", { interval: 1, unit: "year" }],
  ])("shortcut %j", (text, recurrence) => {
    expect(expectWhole(text, "repeat").recurrence).toEqual(recurrence);
  });

  it.each<[string, Recurrence]>([
    ["every day", { interval: 1, unit: "day" }],
    ["every 3 days", { interval: 3, unit: "day" }],
    ["every two days", { interval: 2, unit: "day" }],
    ["every week", week(1)],
    ["every wk", week(1)],
    ["every 2 weeks", week(2)],
    ["every 2 wks", week(2)],
    ["every three weeks", week(3)],
    ["every other week", week(2)],
    ["every month", { interval: 1, unit: "month" }],
    ["every other month", { interval: 2, unit: "month" }],
    ["every 2 mos", { interval: 2, unit: "month" }],
    ["every 2 mo", { interval: 2, unit: "month" }],
    ["every 6 mths", { interval: 6, unit: "month" }],
    ["every twelve months", { interval: 12, unit: "month" }],
    ["every year", { interval: 1, unit: "year" }],
    ["every yr", { interval: 1, unit: "year" }],
    ["every 2 years", { interval: 2, unit: "year" }],
    ["every 10 yrs", { interval: 10, unit: "year" }],
    // Out-of-range counts are clamped by normalizeRecurrence.
    ["every 0 days", { interval: 1, unit: "day" }],
  ])("interval %j", (text, recurrence) => {
    expect(expectWhole(text, "repeat").recurrence).toEqual(recurrence);
  });

  it.each<[string, Recurrence]>([
    ["every weekday", week(1, [1, 2, 3, 4, 5])],
    ["every weekdays", week(1, [1, 2, 3, 4, 5])],
    ["every weekend", week(1, [0, 6])],
  ])("span %j", (text, recurrence) => {
    expect(expectWhole(text, "repeat").recurrence).toEqual(recurrence);
  });

  it.each<[string, Recurrence]>([
    ["every monday", week(1, [1])],
    ["every mondays", week(1, [1])],
    ["every mon", week(1, [1])],
    ["every sun", week(1, [0])],
    ["every monday and friday", week(1, [1, 5])],
    ["every mon, wed and fri", week(1, [1, 3, 5])],
    ["every mon, wed, and fri", week(1, [1, 3, 5])],
    ["every tue & thu", week(1, [2, 4])],
    ["every tues&thurs", week(1, [2, 4])],
    // Weekdays are sorted and de-duplicated.
    ["every sat, sun", week(1, [0, 6])],
    ["every fri, mon, fri", week(1, [1, 5])],
    // All seven days is just daily.
    ["every mon, tue, wed, thu, fri, sat, sun", { interval: 1, unit: "day" }],
  ])("weekdays %j", (text, recurrence) => {
    expect(expectWhole(text, "repeat").recurrence).toEqual(recurrence);
  });

  it.each<[string, Recurrence]>([
    ["every other monday", week(2, [1])],
    ["every other mon", week(2, [1])],
    ["every other tue and thu", week(2, [2, 4])],
    ["every other sat, sun", week(2, [0, 6])],
    // Seven days every other week stays weekly, not daily.
    ["every other mon, tue, wed, thu, fri, sat, sun", week(2, [0, 1, 2, 3, 4, 5, 6])],
  ])("every other weekday %j", (text, recurrence) => {
    expect(expectWhole(text, "repeat").recurrence).toEqual(recurrence);
  });

  it("does not leave a date behind for 'every other monday'", () => {
    const tokens = parse("Gym every other monday");
    expect(tokenOf(tokens, "date")).toBeUndefined();
    expect(stripTokens("Gym every other monday", tokens)).toBe("Gym");
  });

  it("keeps a repeat and a start date as separate tokens", () => {
    const tokens = parse("Standup every monday starting nov 2");
    expect(tokenOf(tokens, "repeat")?.recurrence).toEqual(week(1, [1]));
    expect(tokenOf(tokens, "date")?.date).toBe("2026-11-02");
  });
});

describe("priority", () => {
  it.each([
    ["p1", 1],
    ["p2", 2],
    ["p3", 3],
    ["p4", 4],
    ["P1", 1],
  ])("%j → %d", (text, priority) => {
    const token = tokenOf(parse(text), "priority");
    expect(token?.priority).toBe(priority);
    expect(token?.text).toBe(text);
  });

  it.each(["p0", "p5", "p12", "hp1", "p1x", "mp3 player"])("ignores %j", (text) => {
    expect(tokenOf(parse(text), "priority")).toBeUndefined();
  });

  it("allows sentence punctuation after it", () => {
    expect(tokenOf(parse("Fix the bug p1."), "priority")?.priority).toBe(1);
    expect(tokenOf(parse("Fix the bug (p2)"), "priority")?.priority).toBe(2);
  });
});

describe("projects", () => {
  it.each([
    ["#work", "work", "Work"],
    ["#WORK", "work", "Work"],
    ["#side", "side", "Side"],
    // The longest project name wins over a shorter prefix.
    ["#side hustle", "side-hustle", "Side Hustle"],
    ["#Side-Hustle", "side-hustle", "Side Hustle"],
    ["#side_hustle", "side-hustle", "Side Hustle"],
    ["#side  hustle", "side-hustle", "Side Hustle"],
  ])("%j → %s", (text, projectId, name) => {
    const token = tokenOf(parse(text), "project");
    expect(token).toMatchObject({ projectId, name, text });
  });

  it.each(["#unknown", "#workout", "#2026", "work", "a#work"])("ignores %j", (text) => {
    expect(tokenOf(parse(text), "project")).toBeUndefined();
  });

  it("recognises nothing as a project without a project list", () => {
    expect(parseTitle("#work", { today: TODAY })).toEqual([]);
  });

  it("escapes regex characters in project names", () => {
    const projects = [{ id: "cpp", name: "C++ (old)" }];
    expect(tokenOf(parseTitle("Port #c++ (old)", { today: TODAY, projects }), "project"))
      .toMatchObject({ projectId: "cpp" });
  });
});

describe("token boundaries", () => {
  it.each([
    "tomorrowland",
    "today's plan",
    "pre-today",
    "#today",
    "within 3 days",
    "dailyness",
    "everyday's",
    "fridays",
    "Read https://example.com/today",
    "See www.example.com/tomorrow",
    "Email friday@example.com",
    "Email boss@tomorrow.io",
    "Read two books",
    "buy one more",
    "I'll be there later",
    "Visit in an hour",
    "Momo dinner",
    "every",
    "every other",
    "in days",
  ])("finds nothing in %j", (text) => {
    expect(parse(text)).toEqual([]);
  });

  it("still finds a date next to a time or punctuation", () => {
    expect(tokenOf(parse("Meet 10:30 tomorrow"), "date")?.date).toBe("2026-10-21");
    expect(tokenOf(parse("Call (tomorrow)"), "date")?.date).toBe("2026-10-21");
    expect(tokenOf(parse("Call tomorrow, then email"), "date")?.date).toBe("2026-10-21");
    expect(tokenOf(parse("Ship it friday."), "date")?.date).toBe("2026-10-23");
  });

  it("is case-insensitive and keeps the typed text", () => {
    const tokens = parse("Call Mum TOMORROW Every Monday");
    expect(tokenOf(tokens, "date")).toMatchObject({ date: "2026-10-21", text: "TOMORROW" });
    expect(tokenOf(tokens, "repeat")).toMatchObject({ recurrence: week(1, [1]), text: "Every Monday" });
  });

  it("reports where each token sits in the title", () => {
    const text = "Call mum 2 days later";
    const [token] = parse(text);
    expect(token).toMatchObject({ start: 9, end: 21, text: "2 days later" });
    expect(text.slice(token.start, token.end)).toBe(token.text);
  });
});

describe("parseTitle", () => {
  it("returns nothing for plain text", () => {
    expect(parse("Buy milk")).toEqual([]);
    expect(parse("")).toEqual([]);
  });

  it("returns one token of each kind, in title order", () => {
    const text = "Pay rent tomorrow #work every month p1";
    expect(parse(text).map((token) => token.kind)).toEqual(["date", "project", "repeat", "priority"]);
  });

  it("keeps the last match of each kind", () => {
    const tokens = parse("today or tomorrow p1 p3 #work #side");
    expect(tokens).toHaveLength(3);
    expect(tokenOf(tokens, "date")).toMatchObject({ date: "2026-10-21", text: "tomorrow" });
    expect(tokenOf(tokens, "priority")?.priority).toBe(3);
    expect(tokenOf(tokens, "project")?.projectId).toBe("side");
  });

  it("does not let an invalid later match replace a valid one", () => {
    expect(tokenOf(parse("oct 26 or feb 30"), "date")?.date).toBe("2026-10-26");
    expect(tokenOf(parse("#work #unknown"), "project")?.projectId).toBe("work");
  });

  it("uses the real clock when no today is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, 9, 0));
    expect(tokenOf(parseTitle("tomorrow"), "date")?.date).toBe("2026-03-15");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("stripTokens", () => {
  it.each([
    ["Call mum 2 days later", "Call mum"],
    ["Call mum two days later please", "Call mum please"],
    ["Water plants every three weeks", "Water plants"],
    ["Gym every 2 wks", "Gym"],
    ["Pay the day after tomorrow", "Pay"],
    ["Call friday next week about the lease", "Call about the lease"],
    ["Pay rent tomorrow #work every month p1", "Pay rent"],
    ["#side hustle p2 Draft pitch", "Draft pitch"],
  ])("%j → %j", (text, title) => {
    expect(stripTokens(text, parse(text))).toBe(title);
  });

  it("only removes the token that won, leaving earlier matches of its kind", () => {
    const text = "today or tomorrow";
    expect(stripTokens(text, parse(text))).toBe("today or");
  });

  it("tidies whitespace even with no tokens", () => {
    expect(stripTokens("  Buy   milk ", [])).toBe("Buy milk");
  });
});

describe("tokenKey and tokenOf", () => {
  it("keys a token by kind and lower-cased text", () => {
    const [token] = parse("Call Tomorrow");
    expect(tokenKey(token)).toBe("date:tomorrow");
  });

  it("finds a token by kind, or undefined", () => {
    const tokens = parse("Call tomorrow p2");
    expect(tokenOf(tokens, "priority")?.priority).toBe(2);
    expect(tokenOf(tokens, "repeat")).toBeUndefined();
  });
});

describe("dayFirstLocale", () => {
  it("returns a stable boolean", () => {
    const value = dayFirstLocale();
    expect(typeof value).toBe("boolean");
    expect(dayFirstLocale()).toBe(value);
  });
});
