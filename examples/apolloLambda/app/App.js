const { ApolloServer, PubSub, parseEvent } = require('umble-apollo-server');

const pubSub = new PubSub({ dev: process.env.NODE_ENV === 'development' });

const typeDefs = `
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
  playground: true,
  introspection: true,
  routes: {
    'POST/thing': async (evtOrReq) => {
      const parsed = await parseEvent(evtOrReq);
      console.log(parsed);
      return { body: 'hello world!', statusCode: 200 };
    },
  },
});

exports.ws = server.handlers.ws();
exports.http = server.handlers.http();
exports.event = server.handlers.event();

exports.dev = server.services.run(({ url, subscriptionsUrl }) => {
  console.log(`Server ready at ${url}`);
  console.log(`Subscriptions ready at ${subscriptionsUrl}`);
});
