import { generateId } from "../../security/crypto.js";

export interface DomainEvent<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: string;
  occurredAt: string;
  actorUserId?: string;
  payload: P;
}

export type DomainEventHandler = (
  event: DomainEvent,
) => Promise<unknown> | void;

/**
 * In-process domain event bus.
 *
 * Features publish domain events instead of constructing notifications
 * directly. Notification sources subscribe to event types they care about and
 * translate events into notification drafts. Publishing is intentionally
 * non-fatal: a failing handler is logged and delivery of other notifications
 * continues. Delivery is not transactional with raising event.
 */
export class DomainEventBus {
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();

  subscribe(type: string, handler: DomainEventHandler): () => void {
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(type);
    };
  }

  async publish(
    type: string,
    payload: Record<string, unknown>,
    options: { actorUserId?: string; id?: string } = {},
  ): Promise<void> {
    const event: DomainEvent = {
      id: options.id ?? generateId(),
      type,
      occurredAt: new Date().toISOString(),
      actorUserId: options.actorUserId,
      payload,
    };
    const handlers = this.handlers.get(type);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[notifications] handler for "${type}" failed`, error);
      }
    }
  }
}