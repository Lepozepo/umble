const { default: ApolloClient } = require('apollo-client');
const { WebSocketLink } = require('apollo-link-ws');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { InMemoryCache } = require('apollo-cache-inmemory');
const fetch = require('node-fetch');
const { createHttpLink } = require('apollo-link-http');
const { split } = require('apollo-link');
const { getMainDefinition } = require('apollo-utilities');
const ws = require('ws');

const httpLink = createHttpLink({
  uri: 'https://7h59ik0sjh.execute-api.us-east-2.amazonaws.com/stage/',
  fetch,
});

const wsClient = new SubscriptionClient('wss://upshkmr81a.execute-api.us-east-2.amazonaws.com/stage', {
  reconnect: true,
  lazy: true,
}, ws, []); // The empty array is very important for this to work with AWS!

const wsLink = new WebSocketLink(wsClient);

const link = split(
  // split based on operation type
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition'
      && definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});

module.exports = client;
