const pulumi = require('@pulumi/pulumi');
const { StaticWebApp } = require('../../pkg/dist-node');

const webapp = new StaticWebApp('webapp', {
  buildDir: './webapp/build/',
  buildCmd: 'cd ./webapp && SKIP_PREFLIGHT_CHECK=true yarn build',
  environment: {
    REACT_APP_ENVIRONMENT: 'PRODUCTION',
  },
});

exports.url = pulumi.interpolate`http://${webapp.bucket.websiteEndpoint}`;
