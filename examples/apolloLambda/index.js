const pulumi = require('@pulumi/pulumi');
const { Lambda } = require('../../pkg/dist-node');

const apollo = new Lambda('umble', {
  code: new pulumi.asset.AssetArchive({
    '.': new pulumi.asset.FileArchive('./app'),
  }),
  handler: 'App.handler',
});
exports.url = apollo.api.url;
