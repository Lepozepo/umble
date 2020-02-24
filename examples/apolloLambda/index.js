const { Lambda } = require('../../pkg/dist-node');

const apollo = new Lambda('umble', {
  source: './app',
  handler: 'App.http',
  cors: true,
  // websockets: {
  //   enabled: true,
  //   wsHandler: 'App.ws',
  //   eventHandler: 'App.event',
  // },
});

exports.url = apollo.api.url;
