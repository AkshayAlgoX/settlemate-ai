/*
 * SettleMate AI — In-Memory Metrics Registry (Prometheus exposition format)
 *
 * A tiny, dependency-free metrics registry sufficient for a single-process
 * deployment. Exposes counters, gauges, and histograms and renders them in the
 * Prometheus text exposition format (v0.0.4) via `renderMetrics()`, served at
 * GET /api/metrics.
 *
 * Not a replacement for prom-client in a multi-process cluster (each process
 * would hold its own registry); for this app's single-node model it is exact,
 * allocation-light, and has zero external dependencies.
 */

/**
 * Module-load timestamp. Used to derive process uptime without `process.uptime()`,
 * which is unavailable in the Edge Runtime (this module is reachable from the
 * instrumentation graph, which Next compiles for both runtimes). `Date.now()` is
 * supported everywhere.
 */
const MODULE_LOADED_AT = Date.now();

type Labels = Record<string, string>;

function labelKey(labels?: Labels): string {
  if (!labels) return "";
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}=${labels[k]}`).join(",");
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function renderLabels(labels: Labels | undefined, extra?: Labels): string {
  const merged: Labels = { ...(labels || {}), ...(extra || {}) };
  const keys = Object.keys(merged);
  if (keys.length === 0) return "";
  const parts = keys
    .sort()
    .map((k) => `${k}="${escapeLabelValue(String(merged[k]))}"`);
  return `{${parts.join(",")}}`;
}

interface MetricMeta {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
}

class Counter {
  readonly meta: MetricMeta;
  private values = new Map<string, { labels?: Labels; value: number }>();

  constructor(name: string, help: string) {
    this.meta = { name, help, type: "counter" };
  }

  inc(labels?: Labels, delta = 1): void {
    const key = labelKey(labels);
    const cur = this.values.get(key);
    if (cur) cur.value += delta;
    else this.values.set(key, { labels, value: delta });
  }

  render(): string {
    const lines = [`# HELP ${this.meta.name} ${this.meta.help}`, `# TYPE ${this.meta.name} counter`];
    if (this.values.size === 0) {
      lines.push(`${this.meta.name} 0`);
    } else {
      for (const { labels, value } of this.values.values()) {
        lines.push(`${this.meta.name}${renderLabels(labels)} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

class Gauge {
  readonly meta: MetricMeta;
  private values = new Map<string, { labels?: Labels; value: number }>();

  constructor(name: string, help: string) {
    this.meta = { name, help, type: "gauge" };
  }

  set(value: number, labels?: Labels): void {
    this.values.set(labelKey(labels), { labels, value });
  }

  inc(delta = 1, labels?: Labels): void {
    const key = labelKey(labels);
    const cur = this.values.get(key);
    if (cur) cur.value += delta;
    else this.values.set(key, { labels, value: delta });
  }

  dec(delta = 1, labels?: Labels): void {
    this.inc(-delta, labels);
  }

  render(): string {
    const lines = [`# HELP ${this.meta.name} ${this.meta.help}`, `# TYPE ${this.meta.name} gauge`];
    if (this.values.size === 0) {
      lines.push(`${this.meta.name} 0`);
    } else {
      for (const { labels, value } of this.values.values()) {
        lines.push(`${this.meta.name}${renderLabels(labels)} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

class Histogram {
  readonly meta: MetricMeta;
  private readonly buckets: number[];
  private series = new Map<
    string,
    { labels?: Labels; counts: number[]; sum: number; count: number }
  >();

  constructor(name: string, help: string, buckets: number[] = DEFAULT_BUCKETS) {
    this.meta = { name, help, type: "histogram" };
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels?: Labels): void {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) s.counts[i] += 1;
    }
  }

  render(): string {
    const lines = [`# HELP ${this.meta.name} ${this.meta.help}`, `# TYPE ${this.meta.name} histogram`];
    for (const s of this.series.values()) {
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative = s.counts[i];
        lines.push(
          `${this.meta.name}_bucket${renderLabels(s.labels, { le: String(this.buckets[i]) })} ${cumulative}`
        );
      }
      lines.push(`${this.meta.name}_bucket${renderLabels(s.labels, { le: "+Inf" })} ${s.count}`);
      lines.push(`${this.meta.name}_sum${renderLabels(s.labels)} ${s.sum}`);
      lines.push(`${this.meta.name}_count${renderLabels(s.labels)} ${s.count}`);
    }
    return lines.join("\n");
  }
}

class Registry {
  private metrics: Array<Counter | Gauge | Histogram> = [];

  counter(name: string, help: string): Counter {
    const c = new Counter(name, help);
    this.metrics.push(c);
    return c;
  }

  gauge(name: string, help: string): Gauge {
    const g = new Gauge(name, help);
    this.metrics.push(g);
    return g;
  }

  histogram(name: string, help: string, buckets?: number[]): Histogram {
    const h = new Histogram(name, help, buckets);
    this.metrics.push(h);
    return h;
  }

  render(): string {
    const processUptime = new Gauge("settlemate_process_uptime_seconds", "Process uptime in seconds");
    processUptime.set(Math.round((Date.now() - MODULE_LOADED_AT) / 1000));
    return [...this.metrics, processUptime].map((m) => m.render()).join("\n\n") + "\n";
  }
}

export const registry = new Registry();

/**
 * Application metrics. Import and increment/observe these directly from routes
 * and internal modules; they are all registered against the default registry.
 */
export const metrics = {
  httpRequests: registry.counter(
    "settlemate_http_requests_total",
    "Total HTTP requests handled, labeled by route, method, and status class"
  ),
  httpRequestDurationMs: registry.histogram(
    "settlemate_http_request_duration_ms",
    "HTTP request handling duration in milliseconds, labeled by route"
  ),
  reconciliationRuns: registry.counter(
    "settlemate_reconciliation_runs_total",
    "Total reconciliation runs executed, labeled by outcome"
  ),
  reconciliationExceptions: registry.counter(
    "settlemate_reconciliation_exceptions_total",
    "Total reconciliation exceptions detected"
  ),
  aiCalls: registry.counter(
    "settlemate_ai_calls_total",
    "Total AI/LLM investigator calls, labeled by status"
  ),
  validatorChecks: registry.counter(
    "settlemate_ai_validator_checks_total",
    "Total AI claim-validator checks, labeled by result (pass/fail)"
  ),
  webhookDeliveries: registry.counter(
    "settlemate_webhook_deliveries_total",
    "Total webhook delivery attempts, labeled by status"
  ),
  rateLimitRejections: registry.counter(
    "settlemate_rate_limit_rejections_total",
    "Total requests rejected by the rate limiter"
  ),
  dbBusyRetries: registry.counter(
    "settlemate_db_busy_retries_total",
    "Total SQLITE_BUSY retries performed by the storage layer"
  ),
};

/** Renders all registered metrics in Prometheus text exposition format. */
export function renderMetrics(): string {
  return registry.render();
}

/** Maps an HTTP status code to a Prometheus-friendly status class label (2xx, 4xx, …). */
export function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}
