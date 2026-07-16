import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_LITERAL_IPS = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "fd00:ec2::254",
]);

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** Strip credentials from a URL for safe logging. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a = 0, b = 0] = parts;

  // Link-local / cloud metadata range
  if (a === 169 && b === 254) {
    return true;
  }

  // Unspecified / broadcast
  if (ip === "0.0.0.0" || ip === "255.255.255.255") {
    return true;
  }

  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") {
    // ::1 is localhost — allowed for local Proxmox; only block unspecified.
    return normalized === "::";
  }
  if (normalized === "fd00:ec2::254") {
    return true;
  }
  // IPv4-mapped metadata
  if (normalized.endsWith(":169.254.169.254")) {
    return true;
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  if (BLOCKED_LITERAL_IPS.has(ip.toLowerCase())) {
    return true;
  }

  const version = isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
}

/**
 * Validate that a URL is safe to request from the Rackora server.
 * Allows private LAN addresses (homelab) but blocks cloud metadata targets
 * and non-http(s) schemes. Credentials in the URL are rejected.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http and https URLs are allowed");
  }

  if (url.username || url.password) {
    throw new SsrfError("URL must not contain credentials");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (hostname.length === 0) {
    throw new SsrfError("URL host is required");
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfError("Host is not allowed");
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new SsrfError("Host address is not allowed");
    }
    return url;
  }

  // Resolve DNS and reject if any answer is a blocked metadata address.
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      throw new SsrfError("Host could not be resolved");
    }
    for (const record of records) {
      if (isBlockedIpAddress(record.address)) {
        throw new SsrfError("Host resolves to a blocked address");
      }
    }
  } catch (error) {
    if (error instanceof SsrfError) {
      throw error;
    }
    throw new SsrfError("Host could not be resolved");
  }

  return url;
}
