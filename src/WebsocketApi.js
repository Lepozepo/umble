/* eslint-disable */

import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import random from '@pulumi/random';
import {
  isNil,
  pick,
} from 'lodash';
import p from 'path';
import cp from 'child_process';
import AWS from 'aws-sdk';
import uuid from 'uuid/v4';
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
      async delete(id, inputs) {
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
    }, name, props, ops);
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
    }, name, props, ops);
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
    }, name, props, ops);
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

    if (props.routes) {
      Object.entries(props.routes).map(async ([routeKey, routeProps]) => {
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
      });
    }
  }
}
