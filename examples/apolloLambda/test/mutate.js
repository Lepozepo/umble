const gql = require('graphql-tag');
const client = require('./client');

client
  .mutate({
    mutation: gql`
      mutation {
        broadcastMessage(message: "hello")
      }
    `,
  })
  .then(result => console.log(result.data));
