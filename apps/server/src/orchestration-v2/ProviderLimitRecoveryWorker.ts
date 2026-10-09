import {
  CommandId,
  MessageId,
  type OrchestrationV2Command,
  type ServerSettings as ServerSettingsValue,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

/** The persisted run and reset form the identity of one recovery opportunity. */
export function limitRecoveryCommand(
  thread: ProjectionStore.ProjectionLimitRecoveryCandidate,
  preferences: Pick<
    ServerSettingsValue,
    "autoResumeLimitedThreads" | "autoRetryCapacityErrors" | "snoozeLimitedThreads"
  >,
  nowMs: number,
): OrchestrationV2Command | null {
  const capacityLimited = thread.lastErrorClass === "capacity_limit";
  const resetAt = capacityLimited ? thread.capacityRetryAt : thread.usageLimitResetAt;
  const scheduleResume = capacityLimited
    ? preferences.autoRetryCapacityErrors
    : preferences.autoResumeLimitedThreads;
  const scheduleSnooze = !capacityLimited && preferences.snoozeLimitedThreads;
  if (
    thread.status !== "failed" ||
    (thread.lastErrorClass !== "usage_limit" && !capacityLimited) ||
    !thread.latestRunId ||
    !resetAt ||
    thread.archivedAt !== null ||
    thread.settledOverride === "settled" ||
    thread.pendingRuntimeRequest !== null
  )
    return null;
  const resetMs = Date.parse(resetAt);
  // An already-expired window reported with a fresh failure cannot start a retry loop.
  if (
    !Number.isFinite(resetMs) ||
    resetMs <= DateTime.toEpochMillis(thread.latestRunCompletedAt ?? thread.updatedAt)
  )
    return null;
  const identity = `${thread.id}:${thread.latestRunId}:${resetMs}`;
  const recovery = thread.limitRecovery;
  if (recovery?.runId !== thread.latestRunId || recovery.resetAt !== resetAt) {
    if (!scheduleResume && (!scheduleSnooze || resetMs <= nowMs)) return null;
    return {
      type: "thread.metadata.update",
      commandId: CommandId.make(`limit-arm:${identity}`),
      threadId: thread.id,
      limitRecovery: {
        runId: thread.latestRunId,
        resetAt,
        autoResume: scheduleResume,
        snooze: scheduleSnooze && resetMs > nowMs,
      },
    };
  }
  if (
    !recovery.autoResume ||
    resetMs > nowMs ||
    (thread.snoozedUntil != null && DateTime.toEpochMillis(thread.snoozedUntil) > nowMs)
  )
    return null;
  const deliveryIdentity = `${identity}:${recovery.requestId ?? "legacy"}`;
  return {
    type: "message.dispatch",
    commandId: CommandId.make(`limit-resume:${deliveryIdentity}`),
    messageId: MessageId.make(`limit-resume:${deliveryIdentity}`),
    threadId: thread.id,
    usageLimitContinuationOfRunId: thread.latestRunId,
    ...(recovery.requestId === undefined
      ? {}
      : { usageLimitRecoveryRequestId: recovery.requestId }),
    text: "Continue where you left off.",
    attachments: [],
    dispatchMode: { type: "start_immediately" },
    createdBy: "user",
    creationSource: "server",
  };
}

const makeSweep = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const settings = yield* ServerSettings.ServerSettingsService;
  return Effect.fn("ProviderLimitRecoveryWorker.sweep")(function* () {
    const preferences = yield* settings.getSettings;
    const now = yield* DateTime.now;
    const candidates = yield* projections.getLimitRecoveryCandidates({
      now,
      autoResume: preferences.autoResumeLimitedThreads,
      autoRetryCapacityErrors: preferences.autoRetryCapacityErrors,
      snooze: preferences.snoozeLimitedThreads,
    });
    const nowMs = DateTime.toEpochMillis(now);
    for (const thread of candidates) {
      const command = limitRecoveryCommand(thread, preferences, nowMs);
      if (command === null) continue;
      yield* threads.dispatch(command).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("orchestration-v2.limit-recovery.dispatch-failed", {
            threadId: thread.id,
            cause,
          }),
        ),
      );
    }
  });
});

// The shared scheduler derives due work from persisted failures and recovery
// choices, so restarts need no timer restoration or connected client.
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweep = yield* makeSweep;
    const scheduler = yield* Scheduler.Scheduler;
    yield* scheduler.register("provider-limit-recovery", sweep());
  }),
);
