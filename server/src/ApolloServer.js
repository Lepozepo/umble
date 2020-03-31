import {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBSubscriptionManager,
  Server,
} from 'aws-lambda-graphql';

export default class ApolloServer {
  constructor(props = {}) {
    const {
      connectionManager,
      context,
      eventProcessor,
      onError,
      subscriptionManager,
      subscriptions,
      ...otherProps
    } = props;

    this.eventProcessor = eventProcessor || new DynamoDBEventProcessor();
    this.subscriptionManager = subscriptionManager || new DynamoDBSubscriptionManager({
      subscriptionsTableName: process.env.UMBLE_SUBSCRIPTIONS_TABLE,
      subscriptionOperationsTableName: process.env.UMBLE_OPERATIONS_TABLE,
    });
    this.connectionManager = connectionManager || new DynamoDBConnectionManager({
      subscriptions: this.subscriptionManager,
      connectionsTable: process.env.UMBLE_CONNECTIONS_TABLE,
    });

    this.server = new Server({
      connectionManager: this.connectionManager,
      context,
      eventProcessor: this.eventProcessor,
      onError,
      subscriptionManager: this.subscriptionManager,
      subscriptions,
      ...otherProps,
    });

    this.handlers = {
      ws: () => this.server.createWebSocketHandler(),
      event: () => this.server.createEventHandler(),
      http: (options) => (event, ctx, cb) => {
        const handler = this.server.createHttpHandler(options);

        if (event.isBase64Encoded) {
          // eslint-disable-next-line
          event.body = Buffer.from(event.body, 'base64').toString();
        }

        return handler(event, ctx, cb);
      },
    };
  }
}
