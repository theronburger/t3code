import type { CapacityRetryDelay } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

export const capacityRetryTime = Effect.fnUntraced(function* (
  delay: CapacityRetryDelay,
  failedAt: DateTime.Utc,
) {
  const milliseconds = yield* Random.nextIntBetween(
    delay.minMinutes * 60_000,
    delay.maxMinutes * 60_000,
  );
  return DateTime.formatIso(DateTime.add(failedAt, { milliseconds }));
});
