const {
  DynamoDBConnectionManager,
  DynamoDBEventProcessor,
  DynamoDBEventStore,
  DynamoDBSubscriptionManager,
  PubSub,
  Server,
} = require('aws-lambda-graphql');
const { gql } = require('apollo-server');

const eventStore = new DynamoDBEventStore({
  eventsTable: process.env.EVENTS_TABLE,
});
const eventProcessor = new DynamoDBEventProcessor();
const subscriptionManager = new DynamoDBSubscriptionManager({
  subscriptionsTableName: process.env.SUBSCRIPTIONS_TABLE,
  subscriptionOperationsTableName: process.env.OPERATIONS_TABLE,
});
const connectionManager = new DynamoDBConnectionManager({
  subscriptionManager,
  connectionsTable: process.env.CONNECTIONS_TABLE,
});
const pubSub = new PubSub({ eventStore });

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

const server = new Server({
  connectionManager,
  eventProcessor,
  subscriptionManager,
  typeDefs,
  resolvers,
  playgroud: true,
  introspection: true,
});

exports.ws = server.createWebSocketHandler();
exports.http = server.createHttpHandler();
exports.event = server.createEventHandler();
