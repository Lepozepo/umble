import {
  DynamoDBEventStore,
  PubSub as ALGPubSub,
} from 'aws-lambda-graphql';
import {
  PubSub as InMemoryPubSub,
} from 'apollo-server';

export default class PubSub {
  constructor(props = {}) {
    const {
      eventStore,
      dev = false,
    } = props;

    this.props = props;

    if (dev) {
      this.engine = new InMemoryPubSub();
    } else {
      this.engine = new ALGPubSub({
        eventStore: eventStore || new DynamoDBEventStore({
          eventsTable: process.env.UMBLE_EVENTS_TABLE,
        }),
      });
    }
  }

  subscribe = (events) => {
    if (this.props.dev) {
      return () => this.engine.asyncIterator(events);
    }
    return this.engine.subscribe(events);
  }

  publish = (event, payload) => this.engine.publish(event, payload);
}
