// const pulumi = require('@pulumi/pulumi');
const { Lambda } = require('../../pkg/dist-node');

const apollo = new Lambda('umble', {
  source: './app',
  handler: 'App.handler',
});
exports.url = apollo.api.url;
