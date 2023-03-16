const pulumi = require('@pulumi/pulumi');
const awsx = require('@pulumi/awsx');
const { Service } = require('umble');

const repo = new awsx.ecr.Repository('repo', {
  forceDelete: true,
});

const image = new awsx.ecr.Image('image', {
  repositoryUrl: repo.url,
  path: './app',
});

const api = new Service('umble', {
  image,
  healthCheckUrl: '/.well-known/apollo/server-health',
});

exports.url = pulumi.interpolate`http://${api.httpListener.endpoint.hostname}`;
