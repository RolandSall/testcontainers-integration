import { randomUUID } from 'node:crypto';
import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { Client } from 'pg';
import { Container, type ContainerResources } from '@integration-testing/testcontainers';

/**
 * A deliberately framework-free backend used by every runnable example.
 * It proves the library supplies ordinary connection details, not framework magic.
 */
export class ExampleBackend {
  private constructor(
    private readonly database: Client,
    private readonly rabbitConnection: ChannelModel,
    private readonly rabbitChannel: Channel,
    readonly sqlServerPort: number | undefined,
  ) {}

  static async start(resources: ContainerResources): Promise<ExampleBackend> {
    const postgres = resources.get(Container.PostgreSql);
    const rabbitMq = resources.get(Container.RabbitMq);
    const sqlServerPort = resources.has(Container.SqlServer)
      ? resources.get(Container.SqlServer).port
      : undefined;
    return ExampleBackend.connect(
      postgres.connectionUri,
      rabbitMq.amqpUrl,
      sqlServerPort,
    );
  }

  /** Starts the same SUT from variables installed by explicit project configuration. */
  static async startFromEnvironment(): Promise<ExampleBackend> {
    return ExampleBackend.connect(
      requiredEnvironment('DATABASE_URL'),
      requiredEnvironment('RABBITMQ_URL'),
    );
  }

  private static async connect(
    databaseUrl: string,
    rabbitMqUrl: string,
    sqlServerPort?: number,
  ): Promise<ExampleBackend> {
    const database = new Client({ connectionString: databaseUrl });
    await database.connect();
    let rabbitConnection: ChannelModel | undefined;
    let rabbitChannel: Channel | undefined;
    try {
      await database.query(`
        CREATE TABLE IF NOT EXISTS notes (
          id UUID PRIMARY KEY,
          body TEXT NOT NULL
        )
      `);
      rabbitConnection = await amqp.connect(rabbitMqUrl);
      rabbitChannel = await rabbitConnection.createChannel();
      return new ExampleBackend(database, rabbitConnection, rabbitChannel, sqlServerPort);
    } catch (error) {
      await rabbitChannel?.close().catch(() => undefined);
      await rabbitConnection?.close().catch(() => undefined);
      await database.end().catch(() => undefined);
      throw error;
    }
  }

  async saveNote(body: string): Promise<string> {
    const id = randomUUID();
    await this.database.query('INSERT INTO notes (id, body) VALUES ($1, $2)', [id, body]);
    return id;
  }

  async findNote(id: string): Promise<string | undefined> {
    const result = await this.database.query<{ body: string }>(
      'SELECT body FROM notes WHERE id = $1',
      [id],
    );
    return result.rows[0]?.body;
  }

  async publishAndReceive(body: string): Promise<string> {
    const queue = await this.rabbitChannel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    let timeout: NodeJS.Timeout | undefined;
    const delivery = new Promise<ConsumeMessage>((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Timed out waiting for the RabbitMQ message')),
        10_000,
      );
      void this.rabbitChannel.consume(queue.queue, (message) => {
        if (message !== null) resolve(message);
      }, { noAck: false }).catch(reject);
    });
    this.rabbitChannel.sendToQueue(queue.queue, Buffer.from(body));
    try {
      const message = await delivery;
      this.rabbitChannel.ack(message);
      return message.content.toString('utf8');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      await this.rabbitChannel.deleteQueue(queue.queue);
    }
  }

  async close(): Promise<void> {
    let failure: unknown;
    for (const close of [
      () => this.rabbitChannel.close(),
      () => this.rabbitConnection.close(),
      () => this.database.end(),
    ]) {
      try {
        await close();
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure instanceof Error) throw failure;
    if (failure !== undefined) {
      throw new Error('Failed to close the example backend', { cause: failure });
    }
  }
}

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Required environment variable is missing: ${name}`);
  }
  return value;
};
