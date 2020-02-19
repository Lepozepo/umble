/* eslint-disable */

import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import random from '@pulumi/random';
import {
  isNil,
  omitBy,
} from 'lodash';
import p from 'path';
import cp from 'child_process';
import AWS from 'aws-sdk';
import uuid from 'uuid/v4';

class WebsocketApiProvider extends pulumi.dynamic.Resource {
  constructor(name, props = {}, ops) {
    super({
      async create(inputs) {
        const creds = {
          ...props.credentials,
        };
        if (creds.profile) {
          const processCreds = new AWS.SharedIniFileCredentials({
            profile: creds.profile,
          });
          creds.accessKeyId = processCreds.accessKeyId;
          creds.secretAccessKey = processCreds.secretAccessKey;
        }
        const gateway = new AWS.ApiGatewayV2(creds);

        const api = await gateway.createApi({
          Name: name,
          ProtocolType: 'WEBSOCKET',
          RouteSelectionExpression: '$request.body.action',
        }).promise();

        return { id: api.ApiId, outs: api };
      },
      async delete(id, inputs) {
        const creds = {
          ...props.credentials,
        };
        if (creds.profile) {
          const processCreds = new AWS.SharedIniFileCredentials({
            profile: creds.profile,
          });
          creds.accessKeyId = processCreds.accessKeyId;
          creds.secretAccessKey = processCreds.secretAccessKey;
        }

        const gateway = new AWS.ApiGatewayV2(creds);

        await gateway.deleteApi({
          ApiId: id,
        }).promise().catch(console.log);
      },
    }, name, props, ops);
  }
}

export default class WebsocketApi extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:websocket:WebsocketApi', name, props, ops);

    const credentials = {
      profile: aws.config.profile,
      accessKeyId: aws.config.accessKey,
      secretAccessKey: aws.config.secretKey,
      region: aws.config.region,
    };

    new WebsocketApiProvider(name, { ...props, credentials }, { parent: this });
  }
}
