const aws = require('@pulumi/aws');
const { Lambda } = require('../../pkg/dist-node');

// Left off here
const connectionsTable = new aws.dynamodb.Table('umble-connections', {
  name: 'Connections',
  attributes: [
    {
      name: 'id',
      type: 'S',
    },
  ],
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'id',
});

const subscriptionsTable = new aws.dynamodb.Table('umble-subscriptions', {
  name: 'Subscriptions',
  attributes: [
    {
      name: 'event',
      type: 'S',
    },
    {
      name: 'subscriptionId',
      type: 'S',
    },
  ],
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'event',
  rangeKey: 'subscriptionId',
});

const subscriptionOpsTable = new aws.dynamodb.Table('umble-subscriptionOps', {
  name: 'SubscriptionOperations',
  attributes: [
    {
      name: 'subscriptionId',
      type: 'S',
    },
  ],
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'subscriptionId',
});

const eventsTable = new aws.dynamodb.Table('umble-events', {
  name: 'Events',
  attributes: [
    {
      name: 'id',
      type: 'S',
    },
  ],
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'id',
  streamEnabled: true,
  streamViewType: 'NEW_IMAGE',
});

const apollo = new Lambda('umble', {
  source: './app',
  handler: 'App.http',
  // cors: true,
  websockets: {
    enabled: true,
    wsHandler: 'App.ws',
    eventHandler: 'App.event',
  },
  environment: {
    EVENTS_TABLE: eventsTable.name,
    SUBSCRIPTIONS_TABLE: subscriptionsTable.name,
    OPERATIONS_TABLE: subscriptionOpsTable.name,
    CONNECTIONS_TABLE: connectionsTable.name,
  },
});

eventsTable.onEvent('umble-event-handler', apollo.eventLambda, {
  batchSize: 100,
  startingPosition: 'LATEST',
});

exports.url = apollo.api.url;
exports.websocketUrl = apollo.websocketApi.url;
