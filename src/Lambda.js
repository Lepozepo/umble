import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import {
  isNil,
  omitBy,
} from 'lodash';

export default class Lambda extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:lambda:Lambda', name, {}, ops);

    const {
      code,
      handler = 'index.default',
      path = '/',
      timeout = 300,
      runtime = aws.lambda.NodeJS10dXRuntime,
      environment,
      reservedConcurrentExecutions = -1,
      provisionedConcurrentExecutions = 0,
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
    });
    this.policy = policy;

    const lambda = new aws.lambda.Function(`${name}-lambda`, {
      runtime,
      code,
      timeout,
      handler,
      environment,
      reservedConcurrentExecutions,
      role: role.arn,
      publish: true, // Required for provisioned concurrency
    });
    this.lambda = lambda;

    let concurrency;
    if (provisionedConcurrentExecutions > 0) {
      concurrency = new aws.lambda.ProvisionedConcurrencyConfig(`${name}-concurrency`, {
        functionName: lambda.name,
        qualifier: lambda.version,
        provisionedConcurrentExecutions,
      });
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
    });
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
