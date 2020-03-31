// const {
//   DynamoDBConnectionManager,
//   DynamoDBEventProcessor,
//   DynamoDBEventStore,
//   DynamoDBSubscriptionManager,
//   PubSub,
//   Server,
// } = require('aws-lambda-graphql');
// const { gql } = require('apollo-server');
// 
// const eventStore = new DynamoDBEventStore({
//   eventsTable: process.env.EVENTS_TABLE,
// });
// const eventProcessor = new DynamoDBEventProcessor();
// const subscriptionManager = new DynamoDBSubscriptionManager({
//   subscriptionsTableName: process.env.SUBSCRIPTIONS_TABLE,
//   subscriptionOperationsTableName: process.env.OPERATIONS_TABLE,
// });
// const connectionManager = new DynamoDBConnectionManager({
//   subscriptions: subscriptionManager,
//   connectionsTable: process.env.CONNECTIONS_TABLE,
// });
// const pubSub = new PubSub({ eventStore });
// 
// const typeDefs = gql`
//   type Mutation {
//     broadcastMessage(message: String!): String!
//   }
// 
//   type Query {
//     dummy: String!
//   }
// 
//   type Subscription {
//     messageBroadcast: String!
//   }
// `;
// 
// const resolvers = {
//   Mutation: {
//     broadcastMessage: async (root, { message }) => {
//       await pubSub.publish('NEW_MESSAGE', { message });
// 
//       return message;
//     },
//   },
//   Query: {
//     dummy: () => 'dummy',
//   },
//   Subscription: {
//     messageBroadcast: {
//       resolve: (rootValue) => rootValue.message,
//       subscribe: pubSub.subscribe('NEW_MESSAGE'),
//     },
//   },
// };
// 
// const server = new Server({
//   connectionManager,
//   eventProcessor,
//   subscriptionManager,
//   typeDefs,
//   resolvers,
//   playground: {
//     subscriptionEndpoint: 'wss://esu3sww8l2.execute-api.us-east-2.amazonaws.com/c',
//   },
//   introspection: true,
// });
// 
// exports.ws = server.createWebSocketHandler();
// 
// // NOTE: What I need to do next is deploy and test it out
// // JSON.parse was failing in the handler, probably because
// // of the Buffer stuff so I'm trying to rewire it the same way I'd have to
// // for any other lambda
// exports.http = function http(event, ctx, cb) {
//   const originalHandler = server.createHttpHandler();
// 
//   if (event.isBase64Encoded) {
//     // eslint-disable-next-line
//     event.body = Buffer.from(event.body, 'base64').toString();
//   }
// 
//   return originalHandler(event, ctx, cb);
// };
// 
// 
// exports.event = server.createEventHandler();

const { ApolloServer, PubSub } = require('umble');
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
  playground: true,
  introspection: true,
});

exports.ws = server.handlers.ws();
exports.http = server.handlers.http();
exports.event = server.handlers.event();
