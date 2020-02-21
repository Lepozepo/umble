const gql = require('graphql-tag');
const client = require('./client');

client
  .subscribe({
    query: gql`
      subscription {
        messageBroadcast
      }
    `,
  })
  .subscribe({
    next(data) {
      console.log({ data });
    },
    error(err) {
      console.log({ err });
    },
    complete() {
      console.log('did complete');
    },
  });
