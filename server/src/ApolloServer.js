import {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBSubscriptionManager,
  Server,
} from 'aws-lambda-graphql';
import {
  ApolloServer as ExpressServer,
} from 'apollo-server';
import express from 'express';
import http from 'http';

class ExtendedExpressServer extends ExpressServer {
  async listen(...opts) {
    const app = express();

    app.disable('x-powered-by');

    // provide generous values for the getting started experience
    super.applyMiddleware({
      app,
      path: '/',
      bodyParserConfig: { limit: '50mb' },
      onHealthCheck: this.onHealthCheck,
      cors:
        typeof this.cors !== 'undefined'
          ? this.cors
          : {
            origin: '*',
          },
    });

    const httpServer = http.createServer(app);
    this.httpServer = httpServer;

    if (this.subscriptionServerOptions) {
      this.installSubscriptionHandlers(httpServer);
    }

    await new Promise((resolve) => {
      httpServer.once('listening', resolve);
      // If the user passed a callback to listen, it'll get called in addition
      // to our resolver. They won't have the ability to get the ServerInfo
      // object unless they use our Promise, though.
      httpServer.listen(...(opts.length ? opts : [{ port: 4000 }]));
    });

    return [this.createServerInfo(httpServer, this.subscriptionsPath), app];
  }
}

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
      run: (fn) => () => {
        const [server, app] = new ExtendedExpressServer({
          ...otherProps,
          context,
          subscriptions,
        });

        Object.entries(routes).forEach(([k, v]) => {
          const [httpMethod, ...pathParts] = k.split('/');
          const path = `/${pathParts.join('/')}`;
          if (path === '/') return null;

          return app?.[httpMethod.toLowerCase()](path, async (req, res) => {
            const r = await v(req);
            if (r?.headers) res.set(r?.headers);
            res.status(r?.statusCode || 200).send(r?.body || '');
          });
        });

        server.listen().then(fn);
      },
    };
  }
}
