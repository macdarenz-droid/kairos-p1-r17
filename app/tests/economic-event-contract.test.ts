import { describe, expect, it } from "vitest";
import {
  economicEventId,
  isEconomicEventRecordShape,
  type EconomicEventImpact,
  type EconomicEventRecord,
} from "../src/domain/economic-calendar/economicEvent";
import {
  newsNearTradesWindow,
  projectNewsNearTrade,
  type NewsNearTradeInput,
} from "../src/application/economic-calendar/newsNearTrades";

function event(
  key: string,
  title: string,
  startsAt: string,
  impact: EconomicEventImpact | null = "high",
): EconomicEventRecord {
  return {
    id: economicEventId("typed", key),
    source: "typed",
    title,
    currency: "USD",
    startsAt,
    impact,
    expected: null,
    previous: null,
    actual: null,
    savedAt: "2026-09-20T08:00:00.000Z",
    fetchedAt: null,
  };
}
const trade: NewsNearTradeInput = {
  status: "closed",
  openedAt: "2026-09-24T12:42:00.000Z",
  closedAt: "2026-09-24T13:30:00.000Z",
};
const at = (clock: string) => `2026-09-24T${clock}:00.000Z`;
const cpi = event("cpi", "US CPI", at("12:30"));

describe("a saved news event: the stored shape", () => {
  it("accepts a whole event, with null currency and impact, and a typed value", () => {
    expect(isEconomicEventRecordShape(cpi)).toBe(true);
    expect(
      isEconomicEventRecordShape({
        ...cpi,
        currency: null,
        impact: null,
        expected: "3.1%",
      }),
    ).toBe(true);
    expect(isEconomicEventRecordShape({ ...cpi, title: "x".repeat(80) })).toBe(
      true,
    );
    expect(
      isEconomicEventRecordShape({ ...cpi, expected: "x".repeat(16) }),
    ).toBe(true);
  });

  it("refuses a wrong set of keys or a non-canonical time", () => {
    expect(isEconomicEventRecordShape({ ...cpi, extra: 1 })).toBe(false);
    const { savedAt: _savedAt, ...noSavedAt } = cpi;
    expect(isEconomicEventRecordShape(noSavedAt)).toBe(false);
    expect(isEconomicEventRecordShape({ ...cpi, savedAt: "2026-09-20" })).toBe(
      false,
    );
    expect(
      isEconomicEventRecordShape({ ...cpi, startsAt: "2026-09-24T12:30:00Z" }),
    ).toBe(false);
  });

  it("refuses a wrong source or id", () => {
    expect(isEconomicEventRecordShape({ ...cpi, source: "ff" })).toBe(false);
    expect(isEconomicEventRecordShape({ ...cpi, id: "typed:" })).toBe(false);
    expect(isEconomicEventRecordShape({ ...cpi, id: "ff:cpi" })).toBe(false);
    expect(isEconomicEventRecordShape({ ...cpi, id: "typed:a b" })).toBe(false);
  });

  it("refuses a bad title, currency, impact or value", () => {
    for (const title of ["", " US CPI", "US\nCPI", "x".repeat(81)])
      expect(isEconomicEventRecordShape({ ...cpi, title })).toBe(false);
    for (const currency of ["usd", "USDT"])
      expect(isEconomicEventRecordShape({ ...cpi, currency })).toBe(false);
    expect(isEconomicEventRecordShape({ ...cpi, impact: "huge" })).toBe(false);
    expect(
      isEconomicEventRecordShape({ ...cpi, expected: "x".repeat(17) }),
    ).toBe(false);
  });
});

describe("which saved big news is near a trade", () => {
  const near = (
    startsAt: string,
    impact: EconomicEventImpact | null = "high",
  ) =>
    projectNewsNearTrade(trade, [event("n", "News", startsAt, impact)]).map(
      ({ relation, minutes }) => ({ relation, minutes }),
    );

  it("finds news before the open, up to 30 minutes", () => {
    expect(near(at("12:30"))).toEqual([
      { relation: "before-open", minutes: 12 },
    ]);
    expect(near(at("12:12"))).toEqual([
      { relation: "before-open", minutes: 30 },
    ]);
    expect(near(at("12:11"))).toEqual([]);
    expect(near(at("12:42"))).toEqual([
      { relation: "before-open", minutes: 0 },
    ]);
  });

  it("finds news while the trade was open", () => {
    expect(near(at("13:00"))).toEqual([
      { relation: "while-open", minutes: null },
    ]);
  });

  it("finds news after the close, up to 30 minutes", () => {
    expect(near(at("13:30"))).toEqual([
      { relation: "after-close", minutes: 0 },
    ]);
    expect(near(at("14:00"))).toEqual([
      { relation: "after-close", minutes: 30 },
    ]);
    expect(near("2026-09-24T14:00:01.000Z")).toEqual([]);
  });

  it("puts all the near news in time order", () => {
    const clocks = [
      "14:00",
      "12:11",
      "13:30",
      "12:30",
      "13:00",
      "12:12",
      "12:42",
    ];
    const events = [
      ...clocks.map((clock, index) =>
        event(`e${index}`, `News ${clock}`, at(clock)),
      ),
      event("late", "Late", "2026-09-24T14:00:01.000Z"),
    ];
    expect(
      projectNewsNearTrade(trade, events).map((item) => item.event.startsAt),
    ).toEqual(["12:12", "12:30", "12:42", "13:00", "13:30", "14:00"].map(at));
  });

  it("leaves out news not marked big, and damaged events", () => {
    expect(near(at("12:30"), "medium")).toEqual([]);
    expect(near(at("12:30"), "low")).toEqual([]);
    expect(near(at("12:30"), null)).toEqual([]);
    expect(
      projectNewsNearTrade(trade, [event("bad", "", at("12:30"))]),
    ).toEqual([]);
  });

  it("answers nothing for a trade that is not closed with both times in order", () => {
    const events = [cpi];
    expect(
      projectNewsNearTrade(
        { status: "open", openedAt: trade.openedAt, closedAt: null },
        events,
      ),
    ).toEqual([]);
    expect(projectNewsNearTrade({ ...trade, openedAt: null }, events)).toEqual(
      [],
    );
    expect(
      projectNewsNearTrade(
        { ...trade, openedAt: "2026-09-24T14:00:00.000Z" },
        events,
      ),
    ).toEqual([]);
  });

  it("counts news at the instant of a trade that opens and closes at once as before the open", () => {
    const instant = {
      status: "closed",
      openedAt: at("12:42"),
      closedAt: at("12:42"),
    } as const;
    expect(
      projectNewsNearTrade(instant, [event("n", "News", at("12:42"))]).map(
        ({ relation, minutes }) => ({ relation, minutes }),
      ),
    ).toEqual([{ relation: "before-open", minutes: 0 }]);
  });

  it("freezes the answer and each item", () => {
    const result = projectNewsNearTrade(trade, [cpi]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });
});

describe("the instants a read must cover", () => {
  it("spans 30 minutes before the earliest open to 30 minutes after the latest close", () => {
    const second: NewsNearTradeInput = {
      status: "closed",
      openedAt: "2026-09-25T09:00:00.000Z",
      closedAt: "2026-09-25T10:00:00.000Z",
    };
    const open: NewsNearTradeInput = {
      status: "open",
      openedAt: "2026-09-26T09:00:00.000Z",
      closedAt: null,
    };
    expect(newsNearTradesWindow([trade, second, open])).toEqual({
      from: "2026-09-24T12:12:00.000Z",
      to: "2026-09-25T10:30:00.000Z",
    });
  });

  it("is null with no closed trade", () => {
    expect(
      newsNearTradesWindow([
        { status: "open", openedAt: at("12:00"), closedAt: null },
        { status: "draft", openedAt: null, closedAt: null },
      ]),
    ).toBeNull();
  });
});
