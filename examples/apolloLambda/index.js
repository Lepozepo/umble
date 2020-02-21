const { Lambda } = require('../../pkg/dist-node');

const apollo = new Lambda('umble', {
  source: './app',
  handler: 'App.http',
  // websockets: {
  //   enabled: true,
  //   wsHandler: 'App.ws',
  //   eventHandler: 'App.event',
  // },
});

exports.url = apollo.api.url;
