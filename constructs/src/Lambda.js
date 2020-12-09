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
import md5File from 'md5-file';
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
          Action: ['logs:*', 'cloudwatch:*', 's3:*', 'dynamodb:*', 'execute-api:*', ...allowedActions],
          Resource: '*',
          Effect: 'Allow',
        }],
      }),
    }, { parent: this });
    this.policy = policy;

    const srcBucket = new aws.s3.Bucket(`${name}-lambdaBucket`, {
      forceDestroy: true,
    }, { parent: this });

    const internalId = new random.RandomId(`${name}-internalId`, {
      byteLength: 3,
    }, { parent: this });
    this.internalId = internalId;

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
      layerName: pulumi.interpolate`${name}-${internalId.hex}-layer`,
      sourceCodeHash: md5File.sync(`${source}/${installer === 'yarn' ? 'yarn.lock' : 'package-lock.json'}`),
    }, { parent: this });
    this.layer = layer;

    const lambdaAssetMap = {};
    const sourceCodeHashObj = {};
    readdirp(source).forEach((srcObject) => {
      if (srcObject.includes('node_modules')) return;
      lambdaAssetMap[p.relative(source, srcObject)] = new pulumi.asset.FileAsset(srcObject);
      sourceCodeHashObj[p.relative(source, srcObject)] = md5File.sync(srcObject);
    });

    const sourceCodeHash = uuid(JSON.stringify(sourceCodeHashObj), uuid.URL);
    const lambdaSrc = new aws.s3.BucketObject(`${name}-lambdaSrc`, {
      bucket: srcBucket.bucket,
      source: new pulumi.asset.AssetArchive(lambdaAssetMap),
      key: 'source.zip',
    }, { parent: this });
    this.lambdaSrc = lambdaSrc;

    if (websockets?.enabled) {
      this.connectionsTable = new aws.dynamodb.Table('umble-connections', {
        name: pulumi.interpolate`Connections-${internalId.hex}`,
        attributes: [
          {
            name: 'id',
            type: 'S',
          },
        ],
        billingMode: 'PAY_PER_REQUEST',
        hashKey: 'id',
        ttl: {
          attributeName: 'ttl',
          enabled: true,
        },
      });

      this.subscriptionsTable = new aws.dynamodb.Table('umble-subscriptions', {
        name: pulumi.interpolate`Subscriptions-${internalId.hex}`,
        attributes: [
          {
            name: 'event',
            type: 'S',
          },
          {
            name: 'subscriptionId',
            type: 'S',
          },
        ],
        billingMode: 'PAY_PER_REQUEST',
        hashKey: 'event',
        rangeKey: 'subscriptionId',
        ttl: {
          attributeName: 'ttl',
          enabled: true,
        },
      });

      this.operationsTable = new aws.dynamodb.Table('umble-operations', {
        name: pulumi.interpolate`SubscriptionOperations-${internalId.hex}`,
        attributes: [
          {
            name: 'subscriptionId',
            type: 'S',
          },
        ],
        billingMode: 'PAY_PER_REQUEST',
        hashKey: 'subscriptionId',
        ttl: {
          attributeName: 'ttl',
          enabled: true,
        },
      });

      this.eventsTable = new aws.dynamodb.Table('umble-events', {
        name: pulumi.interpolate`Events-${internalId.hex}`,
        attributes: [
          {
            name: 'id',
            type: 'S',
          },
        ],
        billingMode: 'PAY_PER_REQUEST',
        hashKey: 'id',
        streamEnabled: true,
        streamViewType: 'NEW_IMAGE',
        ttl: {
          attributeName: 'ttl',
          enabled: true,
        },
      });
    }

    const lambdaConfig = {
      runtime,
      timeout,
      handler,
      environment: {
        variables: {
          ...environment,
          ...(websockets?.enabled ? ({
            UMBLE_SUBSCRIPTIONS_TABLE: this.subscriptionsTable.name,
            UMBLE_OPERATIONS_TABLE: this.operationsTable.name,
            UMBLE_CONNECTIONS_TABLE: this.connectionsTable.name,
            UMBLE_EVENTS_TABLE: this.eventsTable.name,
          }) : ({})),
        },
      },
      reservedConcurrentExecutions,
      memorySize,
      layers: [layer, ...layers],
      s3Bucket: srcBucket.bucket,
      s3Key: lambdaSrc.key,
      sourceCodeHash,
      role: role.arn,
      publish: true, // Required for provisioned concurrency
    };
    const httpLambda = new aws.lambda.Function(`${name}-http`, lambdaConfig, { parent: this });
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

    if (cors) {
      this.corsMethod = new aws.apigateway.Method(`${name}-cors`, {
        authorization: 'NONE',
        httpMethod: 'OPTIONS',
        restApi: api.restAPI.id,
        resourceId: api.restAPI.rootResourceId,
      }, { parent: this });

      this.corsIntegration = new aws.apigateway.Integration('integration', {
        type: 'MOCK',
        requestTemplates: {
          'application/json': '{statusCode:200}',
        },
        contentHandling: 'CONVERT_TO_TEXT',
        httpMethod: this.corsMethod.httpMethod,
        resourceId: api.restAPI.rootResourceId,
        restApi: api.restAPI.id,
      }, { parent: this });

      this.corsMethodResponse = new aws.apigateway.MethodResponse('response200', {
        httpMethod: this.corsMethod.httpMethod,
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

      this.corsIntegrationResponse = new aws.apigateway.IntegrationResponse('integration-response', {
        responseTemplates: {
          'application/json': '#set($origin = $input.params("Origin"))\n#if($origin == "") #set($origin = $input.params("origin")) #end\n#if($origin.matches(".*")) #set($context.responseOverride.header.Access-Control-Allow-Origin = $origin) #end',
        },
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': '\'*\'',
          'method.response.header.Access-Control-Allow-Headers': '\'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent\'',
          'method.response.header.Access-Control-Allow-Methods': '\'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT\'',
          // 'method.response.header.Access-Control-Allow-Credentials': '\'false\'',
        },
        httpMethod: this.corsMethod.httpMethod,
        resourceId: api.restAPI.rootResourceId,
        restApi: api.restAPI.id,
        statusCode: this.corsMethodResponse.statusCode,
      }, { parent: this });
    }

    if (websockets?.enabled) {
      const {
        wsHandler = 'index.ws',
        eventHandler = 'index.event',
        ...otherWebsocketProps
      } = websockets;

      // This will set up the connection tracker
      this.wsLambda = new aws.lambda.Function(`${name}-ws`, {
        ...lambdaConfig,
        handler: wsHandler,
      }, { parent: this });

      this.websocketApi = new WebsocketApi(`${name}-ws`, {
        ...omit(otherWebsocketProps, 'enabled'),
        routes: {
          $connect: {
            eventHandler: this.wsLambda,
          },
          $disconnect: {
            eventHandler: this.wsLambda,
          },
          $default: {
            eventHandler: this.wsLambda,
          },
        },
      }, { parent: this });

      this.allowApiGateway = new aws.lambda.Permission('allowApiGateway', {
        action: 'lambda:InvokeFunction',
        function: this.wsLambda.name,
        principal: 'apigateway.amazonaws.com',
      }, { parent: this, dependsOn: [this.wsLambda, this.websocketApi] });

      // This will trigger the stream
      this.eventLambda = new aws.lambda.Function(`${name}-evt`, {
        ...lambdaConfig,
        handler: eventHandler,
      }, { parent: this });

      this.eventsTable.onEvent('umble-event-handler', this.eventLambda, {
        batchSize: 100,
        startingPosition: 'LATEST',
      });
    }

    this.registerOutputs(omitBy({
      role,
      policy,
      httpLambda,
      concurrency,
      api,
      corsMethod: this.corsMethod,
      corsIntegration: this.corsIntegration,
      corsMethodResponse: this.corsMethodResponse,
      corsIntegrationResponse: this.corsIntegrationResponse,
      websocketApi: this.websocketApi,
      wsLambda: this.wsLambda,
      eventLambda: this.eventLambda,
    }, isNil));
  }
}
