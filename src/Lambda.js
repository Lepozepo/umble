import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import random from '@pulumi/random';
import {
  isNil,
  omitBy,
  omit,
} from 'lodash';
import p from 'path';
import cp from 'child_process';
import readdirp from 'recursive-readdir-sync';
import fs from 'fs';
import uuid from 'uuid/v3';
import sha256File from 'sha256-file';
import WebsocketApi from './WebsocketApi';

export default class Lambda extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:lambda:Lambda', name, {}, ops);

    const {
      source,
      handler = 'index.http',
      websockets = {},
      path = '/',
      timeout = 300,
      runtime = aws.lambda.NodeJS10dXRuntime,
      environment,
      memorySize = 128,
      reservedConcurrentExecutions = -1,
      provisionedConcurrentExecutions = 0,
      layers = [],
      stageName = 'stage',
      allowedActions = [],
      buildCmd,
    } = props;

    const installer = fs.existsSync(`${source}/yarn.lock`) ? 'yarn' : 'npm';
    cp.execSync(buildCmd || `cd ${source} && ${installer} install --production && cd ../`, { stdio: 'inherit' });

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

    const srcBucket = new aws.s3.Bucket(`${name}-lambdaBucket`, {
      forceDestroy: true,
    }, { parent: this });

    const layerId = new random.RandomId(`${name}-layerId`, {
      byteLength: 3,
    }, { parent: this });
    this.layerId = layerId;

    const layerSrc = new aws.s3.BucketObject(`${name}-layerSrc`, {
      bucket: srcBucket.bucket,
      source: new pulumi.asset.AssetArchive({
        'nodejs/node_modules': new pulumi.asset.FileArchive(`${source}/node_modules`),
        'nodejs/package.json': new pulumi.asset.FileAsset(`${source}/package.json`),
      }),
      key: 'dependencies.zip',
    }, { parent: this });
    this.layerSrc = layerSrc;

    const layer = new aws.lambda.LayerVersion(`${name}-layer`, {
      compatibleRuntimes: [runtime],
      s3Bucket: srcBucket.bucket,
      s3Key: layerSrc.key,
      layerName: pulumi.interpolate`${name}-${layerId.hex}-layer`,
    }, { parent: this });
    this.layer = layer;

    const lambdaAssetMap = {};
    const sourceCodeHashObj = {};
    readdirp(source).forEach((srcObject) => {
      if (srcObject.includes('node_modules')) return;
      lambdaAssetMap[p.relative(source, srcObject)] = new pulumi.asset.FileAsset(srcObject);
      sourceCodeHashObj[p.relative(source, srcObject)] = sha256File(srcObject);
    });

    const sourceCodeHash = uuid(JSON.stringify(sourceCodeHashObj), uuid.URL);
    const lambdaSrc = new aws.s3.BucketObject(`${name}-lambdaSrc`, {
      bucket: srcBucket.bucket,
      source: new pulumi.asset.AssetArchive(lambdaAssetMap),
      key: 'source.zip',
    }, { parent: this });
    this.lambdaSrc = lambdaSrc;

    const lambdaConfig = {
      runtime,
      timeout,
      handler,
      environment,
      reservedConcurrentExecutions,
      memorySize,
      layers: [layer, ...layers],
      s3Bucket: srcBucket.bucket,
      s3Key: lambdaSrc.key,
      sourceCodeHash,
      role: role.arn,
      publish: true, // Required for provisioned concurrency
    };
    const httpLambda = new aws.lambda.Function(`${name}-httpLambda`, lambdaConfig, { parent: this });
    this.httpLambda = httpLambda;

    let concurrency;
    if (provisionedConcurrentExecutions > 0) {
      concurrency = new aws.lambda.ProvisionedConcurrencyConfig(`${name}-concurrency`, {
        functionName: httpLambda.name,
        qualifier: httpLambda.version,
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
          eventHandler: httpLambda,
        },
        {
          path,
          method: 'GET',
          eventHandler: httpLambda,
        },
      ],
    }, { parent: this });
    this.api = api;

    let websocketApi;
    let wsLambda;
    let eventLambda;

    if (websockets?.enabled) {
      const {
        wsHandler = 'index.ws',
        eventHandler = 'index.event',
        ...otherWebsocketProps
      } = websockets;

      wsLambda = new aws.lambda.Function(`${name}-wsLambda`, {
        ...lambdaConfig,
        handler: wsHandler,
      }, { parent: this });
      this.wsLambda = wsLambda;

      eventLambda = new aws.lambda.Function(`${name}-evtLambda`, {
        ...lambdaConfig,
        handler: eventHandler,
      }, { parent: this });
      this.eventLambda = eventLambda;

      websocketApi = new WebsocketApi(`${name}-ws`, {
        ...omit(otherWebsocketProps, 'enabled'),
        routes: {
          $connect: {
            eventHandler: wsLambda,
          },
          $disconnect: {
            eventHandler: wsLambda,
          },
          $default: {
            eventHandler: wsLambda,
          },
        },
      }, { parent: this });
      this.websocketApi = websocketApi;
    }

    this.registerOutputs(omitBy({
      role,
      policy,
      httpLambda,
      concurrency,
      api,
      websocketApi,
      wsLambda,
      eventLambda,
    }, isNil));
  }
}
