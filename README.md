# Umble
## Humble Pulumi Constructs for Apollo/React Developers

### Constructs

#### Service
Here is a quick example on how to use it. The `./app` directory requires a Dockerfile that exposes the service on port 4000, pulumi will use docker to build your image.

```
const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');
const awsx = require('@pulumi/awsx');
const { Service } = require('umble');

const api = new Service('api', {
  image: awsx.ecs.Image.fromPath('umble-test', './app'),
  environment: {
    NODE_ENV: 'production',
  },
  memory: 512,
  exposePort: 4000,
  useSelfSignedSSL: false,
  policyArn: aws.iam.AdministratorAccess,
  maxScalingCapacity: 4,
  healthCheckUrl: '/.well-known/apollo/server-health',
  vpc: awsx.ec2.Vpc.getDefault(),
});

exports.url = pulumi.interpolate`http://${api.httpListener.endpoint.hostname}`;
```

The values expressed are defaults. The only required variable is image.

#### StaticWebApp
Here is a quick example on how to use it with create react app. It can be used with any static site or static site generator.

```
const pulumi = require('@pulumi/pulumi');
const { StaticWebApp } = require('umble');

const webapp = new StaticWebApp('webapp', {
  buildDir: './webapp/build/',
  buildCmd: 'cd ./webapp && yarn build',
  environment: {
    REACT_APP_ENVIRONMENT: 'PRODUCTION',
  },
});

exports.url = pulumi.interpolate`http://${webapp.bucket.websiteEndpoint}`;
```

#### Serverless
TBA



