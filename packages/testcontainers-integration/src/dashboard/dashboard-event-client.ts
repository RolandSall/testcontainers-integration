import type { DashboardEventInput } from './dashboard-event.js';
import { normalizeDashboardEvent } from './dashboard-event.js';
import type { DashboardSessionDescriptor } from './dashboard-context.js';

const FLUSH_DELAY_MS = 20;
const clients = new Map<string, DashboardEventClient>();
let warned = false;

/** Small batching client used by runner reporters and isolated test workers. */
export class DashboardEventClient {
  private readonly queue: DashboardEventInput[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | undefined;

  static for(descriptor: DashboardSessionDescriptor): DashboardEventClient {
    const key = `${descriptor.endpoint}:${descriptor.writeToken}`;
    let client = clients.get(key);
    if (client === undefined) {
      client = new DashboardEventClient(descriptor);
      clients.set(key, client);
    }
    return client;
  }

  static async flushAll(): Promise<void> {
    await Promise.all([...clients.values()].map(async (client) => client.flush()));
  }

  private constructor(private readonly descriptor: DashboardSessionDescriptor) {}

  emit(event: DashboardEventInput): void {
    this.queue.push(normalizeDashboardEvent(event));
    if (this.queue.length >= 25) {
      void this.flush();
      return;
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, FLUSH_DELAY_MS);
      this.timer.unref();
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.flushing !== undefined) await this.flushing;
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    this.flushing = this.send(events).finally(() => {
      this.flushing = undefined;
    });
    await this.flushing;
    if (this.queue.length > 0) await this.flush();
  }

  private async send(events: readonly DashboardEventInput[]): Promise<void> {
    try {
      const response = await fetch(`${this.descriptor.endpoint}/api/events`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.descriptor.writeToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(events),
      });
      if (!response.ok) throw new Error(`dashboard returned HTTP ${response.status}`);
    } catch (error) {
      if (!warned) {
        warned = true;
        const detail = error instanceof Error ? error.message : 'unknown error';
        process.stderr.write(`[integration:dashboard] live event delivery failed: ${detail}\n`);
      }
    }
  }
}
