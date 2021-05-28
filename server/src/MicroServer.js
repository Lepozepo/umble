import url from 'url';
import * as microrouter from 'microrouter';
import { ApolloServer } from 'apollo-server-micro';
import micro, { send } from 'micro';
import cors from 'micro-cors';

export default class MicroServer {
  constructor(props) {
    this.props = props;
    this.path = '/';

    this.cors = cors({
      allowMethods: this.props?.cors?.methods || ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: this.props?.cors?.allowedHeaders || ['X-Requested-With', 'Access-Control-Allow-Origin', 'X-HTTP-Method-Override', 'Content-Type', 'Authorization', 'Accept'],
      allowCredentials: this.props?.cors?.credentials || true,
      exposeHeaders: this.props?.cors?.exposedHeaders || [],
      maxAge: this.props?.cors?.maxAge || 86400,
      origin: this.props?.cors?.origin || '*',
    });

    this.apollo = new ApolloServer({
      ...this.props,
      subscriptions: {
        ...this.props?.subscriptions,
        path: this.path,
      },
    });
    this.apollo.setGraphQLPath(this.path);
  }

  createServerInfo(server) {
    const serverInfo = {
      // TODO: Once we bump to `@types/node@10` or higher, we can replace cast
      // with the `net.AddressInfo` type, rather than this custom interface.
      // Unfortunately, prior to the 10.x types, this type existed on `dgram`,
      // but not on `net`, and in later types, the `server.address()` signature
      // can also be a string.
      ...server.address(),
      server,
      subscriptionsPath: this.apollo.subscriptionsPath,
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
      pathname: this.apollo.graphqlPath,
    });

    serverInfo.subscriptionsUrl = url.format({
      protocol: 'ws',
      hostname: hostForUrl,
      port: serverInfo.port,
      slashes: true,
      pathname: this.apollo.subscriptionsPath,
    });

    return serverInfo;
  }

  async listen(...opts) {
    const serverRoutes = await this.apollo.start().then(async () => {
      const handler = await this.apollo.createHandler({ path: this.path });
      return microrouter.router(
        microrouter.post(this.path, handler),
        microrouter.get(this.path, handler),
        ...Object.entries(this.props.routes).map(([route, fn]) => {
          const [httpMethod, ...pathParts] = route.split('/');
          const path = `/${pathParts.join('/')}`;
          if (path === '/') return null;

          return microrouter[httpMethod.toLowerCase()](path, async (req, res) => {
            const { statusCode, body } = await fn(req, res);
            send(res, statusCode, body);
          });
        }),
      );
    });

    const server = micro(this.cors((req, res) => (
      req.method === 'OPTIONS' ? res.end() : serverRoutes(req, res)
    )));

    if (this.apollo.subscriptionServerOptions) {
      this.apollo.installSubscriptionHandlers(server);
    }

    await new Promise((resolve) => {
      server.once('listening', resolve);
      // If the user passed a callback to listen, it'll get called in addition
      // to our resolver. They won't have the ability to get the ServerInfo
      // object unless they use our Promise, though.
      server.listen(...(opts.length ? opts : [{ port: 4000 }]));
    });

    return this.createServerInfo(server);
  }
}
