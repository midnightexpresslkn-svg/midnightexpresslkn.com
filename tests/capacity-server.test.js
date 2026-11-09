import { describe, it } from "vitest";
import { createCapacityServer, easternToUtcMs } from "./capacity-server.mjs";
import { check } from "./helpers/failure.js";

const SLOT = { date: "2026-12-15", time: "10:00" };

describe("shared server capacity", () => {
  it("accepts exactly two of three requests for the same time", async () => {
    const server = createCapacityServer();
    const results = await Promise.all(
      ["website", "ara", "website"].map((channel, index) =>
        server.reserve({
          requestId: "ride-" + (index + 1),
          channel,
          ...SLOT,
        }),
      ),
    );
    const accepted = results.filter((result) => result.ok);
    check(accepted.length, 2, {
      label: "two drivers accept two rides and refuse the third",
      actual: results.map((result) => result.ok),
    });
    check(server.events().length, 2, {
      label: "the refused request creates no event",
      actual: server.events().length,
    });
    const channels = server.events().map((event) => event.channel);
    check(channels.includes("website") && channels.includes("ara"), true, {
      label: "website and Ara share one calendar",
      actual: channels,
    });
    check(
      results.some(
        (result) =>
          result.ok === false &&
          result.error ===
            "That time is booked. Both drivers are already out then.",
      ),
      true,
      {
        label: "the third rider is told both drivers are out",
        actual: results,
      },
    );
  });

  it("a retry of the same request does not create another ride", async () => {
    const server = createCapacityServer();
    const first = await server.reserve({
      requestId: "same-click",
      channel: "website",
      ...SLOT,
    });
    const second = await server.reserve({
      requestId: "same-click",
      channel: "website",
      ...SLOT,
    });
    check(first.ok && second.ok && second.idempotent, true, {
      label: "the retry returns the saved result",
      actual: { first, second },
    });
    check(server.events().length, 1, {
      label: "one request id is one event",
      actual: server.events().length,
    });
  });

  it("a full return time keeps neither leg of a round trip", async () => {
    const server = createCapacityServer();
    await server.reserve({
      requestId: "busy-a",
      channel: "website",
      date: "2026-12-16",
      time: "15:00",
    });
    await server.reserve({
      requestId: "busy-b",
      channel: "ara",
      date: "2026-12-16",
      time: "15:00",
    });
    const result = await server.reserve({
      requestId: "round",
      channel: "website",
      date: "2026-12-15",
      time: "10:00",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00",
    });
    check(result.ok, false, {
      label: "the round trip is refused",
      actual: result,
    });
    check(
      result.error,
      "The return time is booked. Both drivers are already out then.",
      {
        label: "the refusal names the return",
        actual: result.error,
      },
    );
    check(
      server.events().some((event) => event.requestId === "round"),
      false,
      {
        label: "the outbound leg was not left on the calendar",
        actual: server.events(),
      },
    );
  });

  it("a failed save of the return removes the outbound leg", async () => {
    const server = createCapacityServer();
    const result = await server.reserve({
      requestId: "rollback",
      channel: "website",
      date: "2026-12-15",
      time: "10:00",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00",
      failAfterFirst: true,
    });
    check(result.ok, false, {
      label: "the round trip does not stay half saved",
      actual: result,
    });
    check(server.events().length, 0, {
      label: "rollback leaves no events",
      actual: server.events(),
    });
  });

  it("reads 10:00 as Eastern even when that is not 10:00 UTC", async () => {
    const tenEastern = easternToUtcMs("2026-12-15", "10:00");
    check(new Date(tenEastern).toISOString(), "2026-12-15T15:00:00.000Z", {
      label: "10:00 Eastern in December is 15:00 UTC",
      actual: new Date(tenEastern).toISOString(),
    });
    const server = createCapacityServer();
    await server.reserve({
      requestId: "et-1",
      channel: "website",
      ...SLOT,
    });
    await server.reserve({
      requestId: "et-2",
      channel: "ara",
      ...SLOT,
    });
    const third = await server.reserve({
      requestId: "et-3",
      channel: "website",
      ...SLOT,
    });
    const later = await server.reserve({
      requestId: "utc-clock",
      channel: "website",
      date: "2026-12-15",
      time: "15:00",
    });
    check(third.ok, false, {
      label: "a third 10:00 Eastern ride is refused",
      actual: third,
    });
    check(later.ok, true, {
      label: "15:00 Eastern is a different slot from 10:00 Eastern",
      actual: later,
    });
  });
});
