import {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBSubscriptionManager,
  Server,
} from 'aws-lambda-graphql';

// NOTE: Server extends apollo-server-lambda
export default class ApolloServer extends Server {
  constructor(props = {}) {
    const {
      connectionManager,
      context,
      eventProcessor,
      onError,
      subscriptionManager,
      subscriptions,
      ...restConfig
    } = props;

    const _eventProcessor = eventProcessor || new DynamoDBEventProcessor();
    const _subscriptionManager = subscriptionManager || new DynamoDBSubscriptionManager({
      subscriptionsTableName: process.env.UMBLE_SUBSCRIPTIONS_TABLE,
      subscriptionOperationsTableName: process.env.UMBLE_OPERATIONS_TABLE,
    });
    const _connectionManager = connectionManager || new DynamoDBConnectionManager({
      subscriptions: _subscriptionManager,
      connectionsTable: process.env.UMBLE_CONNECTIONS_TABLE,
    });

    super({
      connectionManager: _connectionManager,
      context,
      eventProcessor: _eventProcessor,
      onError,
      subscriptionManager: _subscriptionManager,
      subscriptions,
      ...restConfig,
    });
  }

  handlers = {
    ws: super.createWebSocketHandler,
    event: super.createEventHandler,
    http: (options) => (event, ctx, cb) => {
      const handler = super.createHttpHandler(options);

      if (event.isBase64Encoded) {
        // eslint-disable-next-line
        event.body = Buffer.from(event.body, 'base64').toString();
      }

      return handler(event, ctx, cb);
    },
  };
}
