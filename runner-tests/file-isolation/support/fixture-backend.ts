import { connect, type Channel, type ChannelModel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export class FileIsolationBackend {
  private constructor(
    private readonly primary: Client,
    private readonly audit: Client,
    private readonly rabbitConnection: ChannelModel,
    private readonly rabbitChannel: Channel,
  ) {}

  static async start(): Promise<FileIsolationBackend> {
    const primary = new Client({ connectionString: requiredEnvironment('DATABASE_URL') });
    const audit = new Client({ connectionString: requiredEnvironment('AUDIT_DATABASE_URL') });
    let rabbitConnection: ChannelModel | undefined;
    let rabbitChannel: Channel | undefined;
    try {
      await Promise.all([primary.connect(), audit.connect()]);
      await Promise.all([
        primary.query('CREATE TABLE file_records (id text PRIMARY KEY, value text NOT NULL)'),
        audit.query('CREATE TABLE file_records (id text PRIMARY KEY, value text NOT NULL)'),
      ]);
      rabbitConnection = await connect(requiredEnvironment('RABBITMQ_URL'));
      rabbitChannel = await rabbitConnection.createChannel();
      return new FileIsolationBackend(primary, audit, rabbitConnection, rabbitChannel);
    } catch (error) {
      await closeRabbitMq(rabbitChannel, rabbitConnection);
      await Promise.allSettled([primary.end(), audit.end()]);
      throw error;
    }
  }

  async insertAndReadSameIdentifier(value: string): Promise<readonly [string, string]> {
    const identifier = 'same-record-id';
    await Promise.all([
      this.primary.query('INSERT INTO file_records (id, value) VALUES ($1, $2)', [identifier, value]),
      this.audit.query('INSERT INTO file_records (id, value) VALUES ($1, $2)', [identifier, value]),
    ]);
    const [primaryResult, auditResult] = await Promise.all([
      this.primary.query<{ value: string }>('SELECT value FROM file_records WHERE id = $1', [identifier]),
      this.audit.query<{ value: string }>('SELECT value FROM file_records WHERE id = $1', [identifier]),
    ]);
    return [primaryResult.rows[0]?.value ?? '', auditResult.rows[0]?.value ?? ''];
  }

  async publishAndReceive(message: string): Promise<string> {
    const queue = await this.rabbitChannel.assertQueue(`file-isolation-${randomUUID()}`, {
      exclusive: true,
      autoDelete: true,
    });
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('RabbitMQ message was not received')), 10_000);
      void this.rabbitChannel.consume(
        queue.queue,
        (received) => {
          if (received === null) return;
          clearTimeout(timeout);
          resolve(received.content.toString('utf8'));
        },
        { noAck: true },
      ).then(() => {
        this.rabbitChannel.sendToQueue(queue.queue, Buffer.from(message));
      }, reject);
    });
  }

  async close(): Promise<void> {
    await closeRabbitMq(this.rabbitChannel, this.rabbitConnection);
    await Promise.allSettled([this.primary.end(), this.audit.end()]);
  }
}

const closeRabbitMq = async (
  channel: Channel | undefined,
  connection: ChannelModel | undefined,
): Promise<void> => {
  if (channel !== undefined) await channel.close().catch(() => undefined);
  if (connection !== undefined) await connection.close().catch(() => undefined);
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
};
