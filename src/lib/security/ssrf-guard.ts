/*
 * SettleMate AI — Outbound URL SSRF Guard
 *
 * Server-Side Request Forgery protection for outbound requests the server makes
 * on behalf of tenant-supplied URLs (primarily webhook delivery targets). An
 * attacker who can register a webhook URL could otherwise coerce the server into
 * POSTing signed payloads to internal-only endpoints — the classic vector being
 * the cloud instance metadata service at 169.254.169.254, or loopback/private
 * admin endpoints reachable only from inside the VPC.
 *
 * The guard rejects:
 *   - non-http(s) protocols
 *   - reserved hostnames (localhost, *.internal, *.local, *.lan, …)
 *   - IP literals inside loopback / private / link-local / CGNAT / multicast /
 *     reserved ranges, for both IPv4 and IPv6 (incl. IPv4-mapped IPv6)
 *
 * By default it performs NO DNS resolution: it inspects the literal host only.
 * This keeps it fast, offline-safe, and deterministic (a hostname that is not an
 * IP literal is allowed through). Setting WEBHOOK_RESOLVE_DNS=1 enables an extra
 * defense-in-depth pass that resolves the host and blocks it if any resolved
 * address falls in a blocked range (mitigating DNS-rebinding at some latency
 * cost). Resolution is opt-in precisely so it never breaks tests or air-gapped
 * environments where public hostnames do not resolve.
 */

import { lookup } from "node:dns/promises";

export interface UrlSafetyVerdict {
  /** True when the URL must not be requested. */
  blocked: boolean;
  /** Human-readable explanation, present when blocked. */
  reason?: string;
}

/** Hostnames that always denote a local/internal target. */
const RESERVED_HOST_EXACT = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.goog",
]);

/** Suffixes reserved for private/internal use (RFC 6762, RFC 8375, ICANN .internal). */
const RESERVED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".lan", ".home.arpa"];

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isIPv4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** Parses dotted-quad IPv4 into an unsigned 32-bit int, or null if malformed. */
function ipv4ToInt(host: string): number | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0] * 2 ** 24 + octets[1] * 2 ** 16 + octets[2] * 2 ** 8 + octets[3]) >>> 0);
}

function inCidr(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

/** Returns a reason string if the IPv4 address is in a blocked range, else null. */
function blockedIPv4Reason(ip: number): string | null {
  const ranges: Array<[string, number, string]> = [
    ["0.0.0.0", 8, "this-network (0.0.0.0/8)"],
    ["10.0.0.0", 8, "private (10.0.0.0/8)"],
    ["100.64.0.0", 10, "carrier-grade NAT (100.64.0.0/10)"],
    ["127.0.0.0", 8, "loopback (127.0.0.0/8)"],
    ["169.254.0.0", 16, "link-local / cloud metadata (169.254.0.0/16)"],
    ["172.16.0.0", 12, "private (172.16.0.0/12)"],
    ["192.0.0.0", 24, "IETF protocol assignments (192.0.0.0/24)"],
    ["192.168.0.0", 16, "private (192.168.0.0/16)"],
    ["198.18.0.0", 15, "benchmarking (198.18.0.0/15)"],
    ["224.0.0.0", 4, "multicast (224.0.0.0/4)"],
    ["240.0.0.0", 4, "reserved (240.0.0.0/4)"],
  ];
  for (const [base, bits, reason] of ranges) {
    if (inCidr(ip, base, bits)) return reason;
  }
  if (ip === 0xffffffff) return "broadcast (255.255.255.255)";
  return null;
}

/** Expands an IPv6 host string (incl. embedded IPv4 tail and :: compression) to 8 hextets. */
function expandIPv6(host: string): number[] | null {
  let h = host.toLowerCase();

  // Convert a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
  if (h.includes(".")) {
    const idx = h.lastIndexOf(":");
    if (idx < 0) return null;
    const v4int = ipv4ToInt(h.slice(idx + 1));
    if (v4int === null) return null;
    const hi = ((v4int >>> 16) & 0xffff).toString(16);
    const lo = (v4int & 0xffff).toString(16);
    h = h.slice(0, idx + 1) + hi + ":" + lo;
  }

  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: number[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head.map((g) => parseInt(g, 16));
  } else {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [
      ...head.map((g) => parseInt(g || "0", 16)),
      ...new Array(missing).fill(0),
      ...tail.map((g) => parseInt(g || "0", 16)),
    ];
  }

  if (groups.length !== 8 || groups.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff)) return null;
  return groups;
}

/** Returns a reason string if the IPv6 address is in a blocked range, else null. */
function blockedIPv6Reason(g: number[]): string | null {
  const leadingZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0;
  if (leadingZero && g[7] === 1) return "loopback (::1)";
  if (leadingZero && g[7] === 0) return "unspecified (::)";

  // IPv4-mapped ::ffff:0:0/96 — inspect the embedded IPv4.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    const v4 = ((g[6] << 16) + g[7]) >>> 0;
    const r = blockedIPv4Reason(v4);
    return r ? `IPv4-mapped ${r}` : null;
  }

  if ((g[0] & 0xfe00) === 0xfc00) return "unique-local (fc00::/7)";
  if ((g[0] & 0xffc0) === 0xfe80) return "link-local (fe80::/10)";
  if ((g[0] & 0xff00) === 0xff00) return "multicast (ff00::/8)";
  return null;
}

interface IpClassification {
  isIp: boolean;
  reason: string | null;
}

/** Classifies a host as an IP literal and whether that literal is in a blocked range. */
function classifyIpLiteral(host: string): IpClassification {
  if (isIPv4(host)) {
    const int = ipv4ToInt(host);
    if (int === null) return { isIp: true, reason: "malformed IPv4 literal" };
    return { isIp: true, reason: blockedIPv4Reason(int) };
  }
  if (host.includes(":")) {
    const groups = expandIPv6(host);
    if (!groups) return { isIp: true, reason: "malformed IPv6 literal" };
    return { isIp: true, reason: blockedIPv6Reason(groups) };
  }
  return { isIp: false, reason: null };
}

function isReservedHostname(host: string): boolean {
  if (RESERVED_HOST_EXACT.has(host)) return true;
  return RESERVED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Evaluates whether an outbound URL is safe to request. See module header for
 * the policy. Async because the optional DNS-resolution pass awaits a lookup;
 * the default (literal-only) path resolves synchronously.
 */
export async function evaluateOutboundUrl(rawUrl: string): Promise<UrlSafetyVerdict> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { blocked: true, reason: "malformed URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { blocked: true, reason: `unsupported protocol '${parsed.protocol}'` };
  }

  const host = stripBrackets(parsed.hostname).toLowerCase();
  if (!host) return { blocked: true, reason: "empty host" };

  if (isReservedHostname(host)) {
    return { blocked: true, reason: `reserved/internal host '${host}'` };
  }

  const literal = classifyIpLiteral(host);
  if (literal.isIp) {
    return literal.reason ? { blocked: true, reason: literal.reason } : { blocked: false };
  }

  // Defense-in-depth: opt-in resolution to catch public hostnames that point at
  // internal addresses. Off by default so offline/test hosts are never blocked.
  if (process.env.WEBHOOK_RESOLVE_DNS === "1") {
    try {
      const results = await lookup(host, { all: true });
      for (const r of results) {
        const c = classifyIpLiteral(r.address);
        if (c.reason) return { blocked: true, reason: `host '${host}' resolves to ${c.reason}` };
      }
    } catch {
      return { blocked: true, reason: `DNS resolution failed for '${host}'` };
    }
  }

  return { blocked: false };
}

/** Convenience boolean wrapper around {@link evaluateOutboundUrl}. */
export async function isBlockedOutboundUrl(rawUrl: string): Promise<boolean> {
  return (await evaluateOutboundUrl(rawUrl)).blocked;
}
