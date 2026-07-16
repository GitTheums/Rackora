import type { FastifyBaseLogger } from "fastify";
import type { RackoraDatabase } from "../db/client.js";
import type { EncryptionService } from "./encryption.js";
import {
  listIntegrations,
  pollProxmoxIntegration,
} from "./integrations.js";

type SchedulerDeps = {
  db: RackoraDatabase;
  encryption: EncryptionService;
  allowInsecureTls: boolean;
  logger: FastifyBaseLogger;
};

/**
 * Polls enabled integrations on their configured interval.
 * Uses a per-integration mutex so overlapping polls for the same id are skipped.
 */
export class IntegrationScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly inflight = new Map<string, Promise<void>>();
  private started = false;

  constructor(private readonly deps: SchedulerDeps) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.reconcile();
    // Periodically pick up new/updated integrations.
    setInterval(() => {
      void this.reconcile();
    }, 30_000);
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.started = false;
  }

  async reconcile(): Promise<void> {
    const records = await listIntegrations(this.deps.db);
    const enabledIds = new Set(
      records.filter((item) => item.enabled).map((item) => item.id),
    );

    for (const id of this.timers.keys()) {
      if (!enabledIds.has(id)) {
        const timer = this.timers.get(id);
        if (timer) {
          clearInterval(timer);
        }
        this.timers.delete(id);
      }
    }

    for (const record of records) {
      if (!record.enabled) {
        continue;
      }
      if (this.timers.has(record.id)) {
        continue;
      }

      const timer = setInterval(() => {
        void this.trigger(record.id);
      }, record.pollIntervalMs);
      this.timers.set(record.id, timer);

      // Kick off an immediate poll for newly scheduled integrations.
      void this.trigger(record.id);
    }
  }

  /**
   * Trigger a poll. If one is already running for this integration, the call
   * is a no-op (mutex).
   */
  async trigger(integrationId: string): Promise<void> {
    if (this.inflight.has(integrationId)) {
      this.deps.logger.debug(
        { integrationId },
        "Skipping poll; previous poll still in flight",
      );
      return;
    }

    const task = this.runPoll(integrationId).finally(() => {
      this.inflight.delete(integrationId);
    });
    this.inflight.set(integrationId, task);
    await task;
  }

  private async runPoll(integrationId: string): Promise<void> {
    try {
      const result = await pollProxmoxIntegration(
        this.deps.db,
        this.deps.encryption,
        this.deps.allowInsecureTls,
        integrationId,
      );

      if (result.ok) {
        this.deps.logger.info({ integrationId }, "Integration poll succeeded");
      } else {
        this.deps.logger.warn(
          { integrationId, error: result.message },
          "Integration poll failed",
        );
      }
    } catch (error) {
      this.deps.logger.error(
        {
          integrationId,
          err:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : { message: "unknown" },
        },
        "Integration poll crashed",
      );
    }
  }
}
