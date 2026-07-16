import { AGENT_HEARTBEAT_INTERVAL_MS } from "@rackora/shared";
import { z } from "zod";

const agentEnvSchema = z.object({
  CORE_URL: z.string().url(),
  AGENT_NAME: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  DATA_DIR: z.string().min(1),
  ENROLLMENT_TOKEN: z.string().min(1).optional(),
  HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(AGENT_HEARTBEAT_INTERVAL_MS),
  /** Unix socket path; set empty string to disable Docker collection. */
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
});

export type AgentConfig = z.infer<typeof agentEnvSchema>;

/**
 * Resolve agent env, accepting aliases used by Compose:
 * - AGENT_DATA_DIR → DATA_DIR
 * - TELEMETRY_INTERVAL_SECONDS → HEARTBEAT_INTERVAL_MS
 */
export function resolveAgentEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const dataDir = env.DATA_DIR ?? env.AGENT_DATA_DIR;
  let heartbeatIntervalMs = env.HEARTBEAT_INTERVAL_MS;

  if (
    heartbeatIntervalMs === undefined &&
    env.TELEMETRY_INTERVAL_SECONDS !== undefined
  ) {
    const seconds = Number(env.TELEMETRY_INTERVAL_SECONDS);
    if (Number.isFinite(seconds) && seconds > 0) {
      heartbeatIntervalMs = String(Math.round(seconds * 1000));
    }
  }

  return {
    ...env,
    DATA_DIR: dataDir,
    HEARTBEAT_INTERVAL_MS: heartbeatIntervalMs,
  };
}

export function loadAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentConfig {
  const resolved = resolveAgentEnv(env);
  const parsed = agentEnvSchema.safeParse({
    CORE_URL: resolved.CORE_URL,
    AGENT_NAME: resolved.AGENT_NAME,
    DATA_DIR: resolved.DATA_DIR,
    ENROLLMENT_TOKEN: resolved.ENROLLMENT_TOKEN,
    HEARTBEAT_INTERVAL_MS: resolved.HEARTBEAT_INTERVAL_MS,
    DOCKER_SOCKET:
      resolved.DOCKER_SOCKET === undefined
        ? "/var/run/docker.sock"
        : resolved.DOCKER_SOCKET,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid agent configuration: ${details}`);
  }

  return parsed.data;
}
