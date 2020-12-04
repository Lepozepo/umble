// Note: express is only used if you use the ApolloServer.listen API to create
// an express app for you instead of applyMiddleware (which you might not even
// use with express). The dependency is unused otherwise, so don't worry if
// you're not using express or your version doesn't quite match up.
import express from 'express';
import http from 'http';
import url from 'url';
import {
  ApolloServer as ApolloServerBase,
} from 'apollo-server-express';

export default class ApolloServer extends ApolloServerBase {
  constructor(config) {
    super(config);
    this.cors = config && config.cors;
    this.onHealthCheck = config && config.onHealthCheck;
  }

  createServerInfo(server, subscriptionsPath) {
    const serverInfo = {
      // TODO: Once we bump to `@types/node@10` or higher, we can replace cast
      // with the `net.AddressInfo` type, rather than this custom interface.
      // Unfortunately, prior to the 10.x types, this type existed on `dgram`,
      // but not on `net`, and in later types, the `server.address()` signature
      // can also be a string.
      ...server.address(),
      server,
      subscriptionsPath,
    };

    // Convert IPs which mean "any address" (IPv4 or IPv6) into localhost
    // corresponding loopback ip. Note that the url field we're setting is
    // primarily for consumption by our test suite. If this heuristic is wrong
    // for your use case, explicitly specify a frontend host (in the `host`
    // option to ApolloServer.listen).
    let hostForUrl = serverInfo.address;
    if (serverInfo.address === '' || serverInfo.address === '::') hostForUrl = 'localhost';

    serverInfo.url = url.format({
      protocol: 'http',
      hostname: hostForUrl,
      port: serverInfo.port,
      pathname: this.graphqlPath,
    });

    serverInfo.subscriptionsUrl = url.format({
      protocol: 'ws',
      hostname: hostForUrl,
      port: serverInfo.port,
      slashes: true,
      pathname: subscriptionsPath,
    });

    return serverInfo;
  }

  // Listen takes the same arguments as http.Server.listen.
  setupApp() {
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
    this.app = app;
    return app;
  }

  async listen(...opts) {
    // eslint-disable-next-line
    const app = this.app;
    if (!app) throw new Error('App has not been initialized yet! Make sure to call setupApp before listening to it');

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

    return this.createServerInfo(httpServer, this.subscriptionsPath);
  }

  async stop() {
    if (this.httpServer) {
      // eslint-disable-next-line
      const httpServer = this.httpServer;
      await new Promise((resolve) => httpServer.close(resolve));
      this.httpServer = undefined;
    }
    await super.stop();
  }
}
