import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import random from '@pulumi/random';
import {
  isNil,
  omitBy,
} from 'lodash';

// TODO: Add websockets

export default class Lambda extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:lambda:Lambda', name, {}, ops);

    const {
      source,
      handler = 'index.default',
      path = '/',
      timeout = 300,
      runtime = aws.lambda.NodeJS10dXRuntime,
      environment,
      reservedConcurrentExecutions = -1,
      provisionedConcurrentExecutions = 0,
      layers = [],
      stageName = 'stage',
      allowedActions = [],
    } = props;

    const role = new aws.iam.Role(`${name}-role`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: 'lambda.amazonaws.com' }),
    });
    this.role = role;

    const policy = new aws.iam.RolePolicy(`${name}-policy`, {
      role,
      policy: pulumi.output({
        Version: '2012-10-17',
        Statement: [{
          Action: ['logs:*', 'cloudwatch:*', 's3:*', ...allowedActions],
          Resource: '*',
          Effect: 'Allow',
        }],
      }),
    }, { parent: this });
    this.policy = policy;

    const deployBucket = new aws.s3.Bucket(`${name}-lambdaBucket`, {
      forceDestroy: true,
    }, { parent: this });

    const layerId = new random.RandomId(`${name}-layerId`, {
      byteLength: 3,
    }, { parent: this });
    this.layerId = layerId;

    const layerSrc = new aws.s3.BucketObject(`${name}-layerSrc`, {
      bucket: deployBucket.bucket,
      source: new pulumi.asset.AssetArchive({
        'nodejs/node_modules': new pulumi.asset.FileArchive(`${source}/node_modules`),
        'nodejs/package.json': new pulumi.asset.FileAsset(`${source}/package.json`),
      }),
      key: 'nodejs.zip',
    }, { parent: this });
    this.layerSrc = layerSrc;

    const layer = new aws.lambda.LayerVersion(`${name}-layer`, {
      compatibleRuntimes: [runtime],
      s3Bucket: deployBucket.bucket,
      s3Key: layerSrc.key,
      layerName: pulumi.interpolate`${name}-${layerId.hex}-layer`,
    }, { parent: this });
    this.layer = layer;

    const lambda = new aws.lambda.Function(`${name}-lambda`, {
      runtime,
      timeout,
      handler,
      environment,
      reservedConcurrentExecutions,
      layers: [layer, ...layers],
      code: new pulumi.asset.AssetArchive({
        '.': new pulumi.asset.FileArchive(source),
      }),
      role: role.arn,
      publish: true, // Required for provisioned concurrency
    }, { parent: this });
    this.lambda = lambda;

    let concurrency;
    if (provisionedConcurrentExecutions > 0) {
      concurrency = new aws.lambda.ProvisionedConcurrencyConfig(`${name}-concurrency`, {
        functionName: lambda.name,
        qualifier: lambda.version,
        provisionedConcurrentExecutions,
      }, { parent: this });
      this.concurrency = concurrency;
    }

    const api = new awsx.apigateway.API(`${name}-api`, {
      stageName,
      routes: [
        {
          path,
          method: 'POST',
          eventHandler: lambda,
        },
        {
          path,
          method: 'GET',
          eventHandler: lambda,
        },
      ],
    }, { parent: this });
    this.api = api;

    this.registerOutputs(omitBy({
      role,
      policy,
      lambda,
      concurrency,
      api,
    }, isNil));
  }
}
