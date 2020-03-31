import {
  DynamoDBEventStore,
  PubSub as ALGPubSub,
} from 'aws-lambda-graphql';

export default class PubSub extends ALGPubSub {
  constructor({ eventStore } = {}) {
    super({ eventStore });
    this.eventStore = eventStore || new DynamoDBEventStore({
      eventsTable: process.env.UMBLE_EVENTS_TABLE,
    });
  }
}
