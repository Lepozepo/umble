import {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBSubscriptionManager,
  Server,
} from 'aws-lambda-graphql';
import MicroServer from './MicroServer';

export default class ApolloServer {
  constructor(props = {}) {
    const {
      connectionManager,
      context,
      eventProcessor,
      onError,
      subscriptionManager,
      subscriptions,
      routes,
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
      http: (options) => (event, ctx) => {
        if (routes && routes?.[`${event.httpMethod}${event.path}`]) {
          return routes[`${event.httpMethod}${event.path}`]?.(event, ctx);
        }

        const handler = this.server.createHttpHandler(options);
        return handler(event, ctx);
      },
    };

    this.services = {
      run: (fn, ops) => async () => {
        const server = new MicroServer({
          ...otherProps,
          context,
          subscriptions,
          routes,
        });

        server.listen({
          port: 4000,
          ...ops,
        }).then(fn);
      },
    };
  }
}
