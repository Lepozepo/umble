const pulumi = require('@pulumi/pulumi');
const awsx = require('@pulumi/awsx');
const Service = require('../../src/Service');

const api = new Service('umble', {
  image: awsx.ecs.Image.fromPath('umble-test', './app'),
});

exports.url = pulumi.interpolate`http://${api.httpListener.endpoint.hostname}`;
