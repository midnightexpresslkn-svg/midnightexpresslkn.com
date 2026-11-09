/**
 * Reference calendar capacity. This is the contract a shared server must
 * enforce for the website and Ara together. It is not the deployed Apps
 * Script, and a passing run here does not prove that deployment.
 *
 * Two drivers. A ride occupies two hours from its Eastern pickup.
 * A third overlapping ride is refused. One request is accepted or refused
 * as a whole, so a round trip never keeps only one leg. The same request id
 * does not create a second pair of events.
 */

export const DRIVER_COUNT = 2;
export const BLOCK_MINUTES = 120;

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function easternToUtcMs(dateStr, timeStr) {
  const dateParts = String(dateStr || "")
    .split("-")
    .map(Number);
  const timeParts = String(timeStr || "").split(":");
  const y = dateParts[0];
  const m = dateParts[1];
  const d = dateParts[2];
  const hh = Number(timeParts[0]);
  const mm = Number(timeParts[1]);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return NaN;
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 4; i += 1) {
    const bag = {};
    EASTERN.formatToParts(new Date(utc)).forEach((part) => {
      bag[part.type] = part.value;
    });
    const shown = Date.UTC(
      Number(bag.year),
      Number(bag.month) - 1,
      Number(bag.day),
      Number(bag.hour) % 24,
      Number(bag.minute),
    );
    const want = Date.UTC(y, m - 1, d, hh, mm);
    utc += want - shown;
  }
  return utc;
}

function overlaps(a, b) {
  return Math.abs(a - b) < BLOCK_MINUTES * 60 * 1000;
}

export function createCapacityServer() {
  const events = [];
  const kept = new Map();
  let tail = Promise.resolve();

  function withLock(work) {
    const run = tail.then(work, work);
    tail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  function reserve(request) {
    return withLock(() => {
      const requestId = String(request.requestId || "");
      if (!requestId) {
        return {
          ok: false,
          error: "Missing request id",
          created: 0,
        };
      }
      if (kept.has(requestId)) {
        return { ...kept.get(requestId), idempotent: true };
      }

      const legs = [
        {
          name: "pickup",
          start: easternToUtcMs(request.date, request.time),
        },
      ];
      if (request.roundTrip) {
        legs.push({
          name: "return",
          start: easternToUtcMs(request.returnDate, request.returnTime),
        });
      }
      if (legs.some((leg) => !Number.isFinite(leg.start))) {
        return {
          ok: false,
          error: "Missing or invalid pickup date/time",
          created: 0,
        };
      }

      for (const leg of legs) {
        const others =
          events.filter((event) => overlaps(event.start, leg.start)).length +
          legs.filter(
            (other) => other !== leg && overlaps(other.start, leg.start),
          ).length;
        if (others >= DRIVER_COUNT) {
          return {
            ok: false,
            error:
              leg.name === "return"
                ? "The return time is booked. Both drivers are already out then."
                : "That time is booked. Both drivers are already out then.",
            created: 0,
          };
        }
      }

      if (request.failAfterFirst) {
        events.push({
          start: legs[0].start,
          requestId,
          channel: request.channel || "",
          leg: legs[0].name,
        });
        events.splice(
          events.findIndex((event) => event.requestId === requestId),
          1,
        );
        return {
          ok: false,
          error:
            "The calendar did not save the return, so the first ride was removed.",
          created: 0,
        };
      }

      for (const leg of legs) {
        events.push({
          start: leg.start,
          requestId,
          channel: request.channel || "",
          leg: leg.name,
        });
      }
      const result = {
        ok: true,
        created: legs.length,
        requestId,
        channel: request.channel || "",
      };
      kept.set(requestId, result);
      return result;
    });
  }

  return {
    reserve,
    events: () => events.map((event) => ({ ...event })),
  };
}
