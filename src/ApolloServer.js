import {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBSubscriptionManager,
  Server,
} from 'aws-lambda-graphql';

// NOTE: Server extends apollo-server-lambda
export default class ApolloServer extends Server {
  constructor({
    connectionManager,
    context,
    eventProcessor,
    onError,
    subscriptionManager,
    subscriptions,
    ...restConfig
  }) {
    super({
      ...restConfig,
      context:
        typeof context === 'function'
          ? (integrationContext) => Promise.resolve(context(integrationContext)).then((ctx) => ({
            ...ctx,
            ...integrationContext,
          }))
          : (integrationContext) => ({
            ...context,
            ...integrationContext,
          }),
    });

    this.eventProcessor = eventProcessor || new DynamoDBEventProcessor();
    this.onError = onError || ((err) => console.error(err));
    this.subscriptionManager = subscriptionManager || new DynamoDBSubscriptionManager({
      subscriptionsTableName: process.env.UMBLE_SUBSCRIPTIONS_TABLE,
      subscriptionOperationsTableName: process.env.UMBLE_OPERATIONS_TABLE,
    });
    this.connectionManager = connectionManager || new DynamoDBConnectionManager({
      subscriptions: this.subscriptionManager,
      connectionsTable: process.env.UMBLE_CONNECTIONS_TABLE,
    });
    this.subscriptionOptions = subscriptions;
  }

  handlers = {
    ws: this.createWebSocketHandler,
    event: this.createEventHandler,
    http: (options) => (event, ctx, cb) => {
      const handler = this.createHttpHandler(options);

      if (event.isBase64Encoded) {
        // eslint-disable-next-line
        event.body = Buffer.from(event.body, 'base64').toString();
      }

      return handler(event, ctx, cb);
    },
  };
}
