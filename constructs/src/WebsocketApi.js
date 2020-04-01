import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import {
  pick,
} from 'lodash';
import AWS from 'aws-sdk';
import camelKeys from './camelKeys';
import upperKeys from './upperKeys';

function identifyCredentials(pulumiCredentials) {
  const creds = {
    ...pulumiCredentials,
  };
  if (creds.profile) {
    const processCreds = new AWS.SharedIniFileCredentials({
      profile: creds.profile,
    });
    creds.accessKeyId = processCreds.accessKeyId;
    creds.secretAccessKey = processCreds.secretAccessKey;
  }
  return creds;
}

const AWS_API_PROPS = [
  'Name',
  'ApiKeySelectionExpression',
  'CorsConfiguration',
  'CredentialsArn',
  'Description',
  'DisableSchemaValidation',
  'RouteKey',
  'Tags',
  'Target',
  'Version',
];

function serviceOutputs(service) {
  if (!service) return {};
  switch (service) {
    case 'api': {
      return {
        apiEndpoint: undefined,
        apiId: undefined,
        apiKeySelectionExpression: undefined,
        corsConfiguration: undefined,
        createdDate: undefined,
        description: undefined,
        disableSchemaValidation: undefined,
        importInfo: undefined,
        name: undefined,
        protocolType: undefined,
        routeSelectionExpression: undefined,
        tags: undefined,
        version: undefined,
        warnings: undefined,
      };
    }
    case 'stage': {
      return {
        accessLogSettings: undefined,
        apiGatewayManaged: undefined,
        autoDeploy: undefined,
        clientCertificateId: undefined,
        createdDate: undefined,
        defaultRouteSettings: undefined,
        deploymentId: undefined,
        description: undefined,
        lastDeploymentStatusMessage: undefined,
        lastUpdatedDate: undefined,
        routeSettings: undefined,
        stageName: undefined,
        stageVariables: undefined,
        tags: undefined,
      };
    }
    case 'route': {
      return {
        apiGatewayManaged: undefined,
        apiKeyRequired: undefined,
        authorizationScopes: undefined,
        authorizationType: undefined,
        authorizerId: undefined,
        modelSelectionExpression: undefined,
        operationName: undefined,
        requestModels: undefined,
        requestParameters: undefined,
        routeId: undefined,
        routeKey: undefined,
        routeResponseSelectionExpression: undefined,
        target: undefined,
      };
    }
    case 'integration': {
      return {
        apiGatewayManaged: undefined,
        connectionId: undefined,
        connectionType: undefined,
        contentHandlingStrategy: undefined,
        credentialsArn: undefined,
        description: undefined,
        integrationId: undefined,
        integrationMethod: undefined,
        integrationResponseSelectionExpression: undefined,
        integrationType: undefined,
        integrationUri: undefined,
        passthroughBehavior: undefined,
        payloadFormatVersion: undefined,
        requestParameters: undefined,
        requestTemplates: undefined,
        templateSelectionExpression: undefined,
        timeoutInMillis: undefined,
        tlsConfig: undefined,
      };
    }
    default: {
      return {};
    }
  }
}

class Api extends pulumi.dynamic.Resource {
  constructor(name, props = {}, ops) {
    super({
      async create(inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const api = await gateway.createApi({
          ...pick(upperKeys(inputs), AWS_API_PROPS),
          ProtocolType: 'WEBSOCKET',
          RouteSelectionExpression: '$request.body.action',
        }).promise();

        return {
          id: api.ApiId,
          outs: {
            ...inputs,
            ...camelKeys(api),
          },
        };
      },
      async delete(id) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        await gateway.deleteApi({
          ApiId: id,
        }).promise().catch(console.log);
      },
      async update(id, olds, news) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const api = await gateway.updateApi({
          ...pick(upperKeys(news), AWS_API_PROPS),
          ApiId: id,
          RouteSelectionExpression: '$request.body.action',
        }).promise();

        return {
          outs: {
            ...news,
            ...camelKeys(api),
          },
        };
      },
    }, name, { ...serviceOutputs('api'), ...props }, ops);
  }
}

class Integration extends pulumi.dynamic.Resource {
  constructor(name, props = {}, ops) {
    super({
      async create(inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const integration = await gateway.createIntegration({
          ApiId: inputs.apiId,
          IntegrationType: 'AWS_PROXY',
          IntegrationUri: inputs.integrationUri,
        }).promise();

        return {
          id: integration.IntegrationId,
          outs: {
            ...inputs,
            ...camelKeys(integration),
          },
        };
      },
      async delete(id, inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        await gateway.deleteIntegration({
          ApiId: inputs.apiId,
          IntegrationId: id,
        }).promise().catch(console.log);
      },
      async update(id, olds, news) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const integration = await gateway.updateIntegration({
          ApiId: olds.apiId,
          IntegrationId: id,
          IntegrationUri: news.eventHandler,
        }).promise();

        return {
          outs: {
            ...news,
            ...camelKeys(integration),
          },
        };
      },
    }, name, { ...serviceOutputs('integration'), ...props }, ops);
  }
}

class Route extends pulumi.dynamic.Resource {
  constructor(name, props = {}, ops) {
    super({
      async create(inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const route = await gateway.createRoute({
          AuthorizationType: 'NONE',
          ApiId: inputs.apiId,
          RouteKey: inputs.routeKey,
          Target: `integrations/${inputs.integrationId}`,
        }).promise();

        return {
          id: route.RouteId,
          outs: {
            ...inputs,
            ...camelKeys(route),
          },
        };
      },
      async delete(id, inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        await gateway.deleteRoute({
          ApiId: inputs.apiId,
          RouteId: id,
        }).promise().catch(console.log);
      },
      async update(id, olds, news) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const route = await gateway.updateRoute({
          ApiId: olds.apiId,
          RouteId: id,
          RouteKey: news.routeKey,
          Target: `integrations/${news.integrationId}`,
        }).promise();

        return {
          outs: {
            ...news,
            ...camelKeys(route),
          },
        };
      },
    }, name, { ...serviceOutputs('route'), ...props }, ops);
  }
}

class Stage extends pulumi.dynamic.Resource {
  constructor(name, props = {}, ops) {
    super({
      async create(inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const stage = await gateway.createStage({
          ApiId: inputs.apiId,
          StageName: inputs.name,
          AutoDeploy: true,
        }).promise();

        return {
          id: stage.StageName,
          outs: {
            ...inputs,
            ...camelKeys(stage),
          },
        };
      },
      async delete(id, inputs) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        await gateway.deleteStage({
          ApiId: inputs.apiId,
          StageName: id,
        }).promise().catch(console.log);
      },
      async update(id, olds, news) {
        const creds = identifyCredentials(props._credentials);
        const gateway = new AWS.ApiGatewayV2(creds);

        const stage = await gateway.updateStage({
          ApiId: olds.apiId,
          StageName: id,
        }).promise();

        return {
          outs: {
            ...news,
            ...camelKeys(stage),
          },
        };
      },
    }, name, { ...serviceOutputs('stage'), ...props }, ops);
  }
}

export default class WebsocketApi extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:websocket:WebsocketApi', name, props, ops);

    const _credentials = {
      profile: aws.config.profile,
      accessKeyId: aws.config.accessKey,
      secretAccessKey: aws.config.secretKey,
      region: aws.config.region,
    };

    const api = new Api(name, { name, ...props, _credentials }, { parent: this });

    const routeConstructs = {};
    if (props.routes) {
      Object.entries(props.routes).forEach(([routeKey, routeProps]) => {
        const integration = new Integration(`intg-${routeKey}`, {
          apiId: api.id,
          integrationUri: routeProps.eventHandler.invokeArn,
          _credentials,
        }, { parent: this });
        const route = new Route(`route-${routeKey}`, {
          apiId: api.id,
          routeKey,
          integrationId: integration.id,
          _credentials,
        }, { parent: this });

        routeConstructs[`intg-${routeKey}`] = integration;
        routeConstructs[`route-${routeKey}`] = route;
      });
    }

    const stage = new Stage(`${name}-stage`, { name: props.stageName || 'stage', apiId: api.id, _credentials }, { parent: this });

    // console.log({ api, stage });
    this.url = pulumi.interpolate`${api.apiEndpoint}/${stage.stageName}`;

    this.registerOutputs({
      url: this.url,
    });
  }
}
