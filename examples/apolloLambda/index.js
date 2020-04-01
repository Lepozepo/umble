const { Lambda } = require('../../constructs/pkg/dist-node');

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
    NODE_ENV: 'production',
  },
});

exports.url = apollo.api.url;
exports.websocketUrl = apollo.websocketApi.url;
