import {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBSubscriptionManager,
  Server,
} from 'aws-lambda-graphql';
import ExpressServer from './ExpressServer';

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
      http: (options) => async (event, ctx, cb) => {
        const handler = this.server.createHttpHandler(options);

        if (event.isBase64Encoded) {
          // eslint-disable-next-line
          event.body = Buffer.from(event.body, 'base64').toString();
        }

        if (routes && routes?.[`${event.httpMethod}/${event.path}`]) {
          const r = await routes[`${event.httpMethod}/${event.path}`]?.(event, ctx);
          return cb(null, r);
        }

        return handler(event, ctx, cb);
      },
    };

    this.services = {
      run: (fn, ops) => async () => {
        const server = new ExpressServer({
          ...otherProps,
          context,
          subscriptions,
        });
        const app = server.setupApp();

        Object.entries(routes || {}).forEach(([k, v]) => {
          const [httpMethod, ...pathParts] = k.split('/');
          const path = `/${pathParts.join('/')}`;
          if (path === '/') return null;

          return app?.[httpMethod.toLowerCase()](path, async (req, res) => {
            const r = await v(req);
            if (r?.headers) res.set(r?.headers);
            res.status(r?.statusCode || 200).send(r?.body || '');
          });
        });

        server.listen(ops).then(fn);
      },
    };
  }
}
