# Umble
## Humble Pulumi Constructs for Apollo/React Developers

To use Umble you'll need to install pulumi and umble's subpackages.

For your infrastructure: `npx install-peerdeps umble`

For your apollo server: `npm i umble-apollo-server`

### Constructs
#### Service
Here is a quick example on how to use it. The `./app` directory requires a Dockerfile that exposes the service on port 4000, pulumi will use docker to build your image.

```
const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');
const awsx = require('@pulumi/awsx');
const { Service } = require('umble');

const repo = new awsx.ecr.Repository('repo', {
  forceDelete: true,
});

const image = new awsx.ecr.Image('image', {
  repositoryUrl: repo.url,
  path: './app',
});

const api = new Service('api', {
  image,
  environment: {
    NODE_ENV: 'production',
  },
});

exports.url = pulumi.interpolate`http://${api.httpListener.endpoint.hostname}`;
```

The values expressed are defaults. The only required variable is image.

#### StaticWebApp
Here is a quick example on how to use it with create react app. It can be used with any static site or static site generator.

```
const pulumi = require('@pulumi/pulumi');
const { StaticWebApp } = require('umble');

const webapp = new StaticWebApp('webapp', {
  buildDir: './webapp/build/',
  buildCmd: 'cd ./webapp && yarn build',
  environment: {
    REACT_APP_ENVIRONMENT: 'PRODUCTION',
  },
});

exports.url = pulumi.interpolate`http://${webapp.bucket.websiteEndpoint}`;
```

#### Lambda
Here is a quick example on how to use it with `umble-apollo-server`. It uses an opinionated abstraction of [aws-lambda-graphql](https://github.com/michalkvasnicak/aws-lambda-graphql) which internally extends [apollo-server-lambda](https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-lambda)

```
const { Lambda } = require('umble-apollo-server');

const apollo = new Lambda('umble', {
  source: './app',
  handler: 'App.http',
  websockets: {
    enabled: true,
    wsHandler: 'App.ws',
    eventHandler: 'App.event',
  },
});

exports.url = apollo.api.url;
exports.websocketUrl = apollo.websocketApi.url;
```

Your `./app` directory should use `umble-apollo-server` and expose the `http`, `ws`, and `event` handlers.

### Servers

#### ApolloServer
Here is a quick example of what the `./app` directory would look like for a basic app.

```
const { ApolloServer, PubSub } = require('umble-apollo-server');
const { gql } = require('apollo-server');

const pubSub = new PubSub();

const typeDefs = gql`
  type Mutation {
    broadcastMessage(message: String!): String!
  }

  type Query {
    dummy: String!
  }

  type Subscription {
    messageBroadcast: String!
  }
`;

const resolvers = {
  Mutation: {
    broadcastMessage: async (root, { message }) => {
      await pubSub.publish('NEW_MESSAGE', { message });

      return message;
    },
  },
  Query: {
    dummy: () => 'dummy',
  },
  Subscription: {
    messageBroadcast: {
      resolve: (rootValue) => rootValue.message,
      subscribe: pubSub.subscribe('NEW_MESSAGE'),
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  playground: true,  // playground subscriptions do not work live because it injects headers that AWS is currently unable to resolve
  introspection: true,
});

exports.ws = server.handlers.ws();
exports.http = server.handlers.http();
exports.event = server.handlers.event();
```

