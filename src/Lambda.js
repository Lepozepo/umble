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
      cors = false,
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
          method: 'ANY',
          eventHandler: httpLambda,
        },
      ],
    }, { parent: this });
    this.api = api;

    let corsMethod;
    let corsIntegration;
    let corsMethodResponse;
    let corsIntegrationResponse;

    if (cors) {
      corsMethod = new aws.apigateway.Method(`${name}-cors`, {
        authorization: 'NONE',
        httpMethod: 'OPTIONS',
        restApi: api.restAPI.id,
        resourceId: api.restAPI.rootResourceId,
      }, { parent: this });
      this.corsMethod = corsMethod;

      corsIntegration = new aws.apigateway.Integration('integration', {
        type: 'MOCK',
        requestTemplates: {
          'application/json': '{statusCode:200}',
        },
        contentHandling: 'CONVERT_TO_TEXT',
        httpMethod: corsMethod.httpMethod,
        resourceId: api.restAPI.rootResourceId,
        restApi: api.restAPI.id,
      }, { parent: this });
      this.corsIntegration = corsIntegration;

      corsMethodResponse = new aws.apigateway.MethodResponse('response200', {
        httpMethod: corsMethod.httpMethod,
        resourceId: api.restAPI.rootResourceId,
        restApi: api.restAPI.id,
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true,
          'method.response.header.Access-Control-Allow-Headers': true,
          'method.response.header.Access-Control-Allow-Methods': true,
          // 'method.response.header.Access-Control-Allow-Credentials': true,
        },
        responseModels: {},
      }, { parent: this });
      this.corsMethodResponse = corsMethodResponse;

      corsIntegrationResponse = new aws.apigateway.IntegrationResponse('integration-response', {
        responseTemplates: {
          'application/json': '#set($origin = $input.params("Origin"))\n#if($origin == "") #set($origin = $input.params("origin")) #end\n#if($origin.matches(".*")) #set($context.responseOverride.header.Access-Control-Allow-Origin = $origin) #end',
        },
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': '\'*\'',
          'method.response.header.Access-Control-Allow-Headers': '\'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent\'',
          'method.response.header.Access-Control-Allow-Methods': '\'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT\'',
          // 'method.response.header.Access-Control-Allow-Credentials': '\'false\'',
        },
        httpMethod: corsMethod.httpMethod,
        resourceId: api.restAPI.rootResourceId,
        restApi: api.restAPI.id,
        statusCode: corsMethodResponse.statusCode,
      }, { parent: this });
      this.corsIntegrationResponse = corsIntegrationResponse;
    }

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
      corsMethod,
      corsIntegration,
      corsMethodResponse,
      corsIntegrationResponse,
    }, isNil));
  }
}
