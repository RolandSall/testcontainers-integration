import {
  Container,
  IntegrationEnvironment,
  OwnedContainerSource,
  createDefaultContainerRegistry,
} from '@integration-testing/testcontainers';

interface AcceptanceApplication {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export const acceptanceEnvironment = new IntegrationEnvironment<AcceptanceApplication>({
  requiredContainers: [Container.PostgreSql, Container.RabbitMq],
  containers: new OwnedContainerSource(createDefaultContainerRegistry()),
  application: {
    start: async (resources) => {
      const database = resources.get(Container.PostgreSql);
      const broker = resources.get(Container.RabbitMq);
      return startApplication(database.connectionUri, broker.amqpUrl);
    },
    stop: (application) => application.close(),
  },
});

const startApplication = (
  databaseUrl: string,
  brokerUrl: string,
): Promise<AcceptanceApplication> => {
  void databaseUrl;
  void brokerUrl;
  return Promise.resolve({
    baseUrl: 'http://127.0.0.1:3000',
    close: () => Promise.resolve(),
  });
};
