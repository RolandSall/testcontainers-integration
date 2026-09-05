import type { ContainerResource } from '../container-contract.js';
import { Container } from '../container-kind.js';

/** Host-facing RabbitMQ connection facts discovered after startup. */
export interface RabbitMqResource extends ContainerResource {
  readonly kind: typeof Container.RabbitMq;
  readonly host: string;
  readonly port: number;
  readonly amqpUrl: string;
  readonly amqpsUrl: string;
}
