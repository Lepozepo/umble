import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import {
  isFunction,
  isObject,
  isNil,
  omitBy,
  isEmpty,
} from 'lodash';

export default class Service extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:service:Service', name, {}, ops);

    const {
      image,
      environment: _environment,
      container,
      desiredCount = 1,
      exposePort: port = 4000,
      policyArn = aws.iam?.AdministratorAccess || aws.iam?.ManagedPolicy?.AdministratorAccess,
      maxScalingCapacity: maxCapacity = 4,
      minScalingCapacity: minCapacity = 1,
      cpuScalingValue = 70,
      memoryScalingValue = 70,
      healthCheckUrl,
      healthCheckOverrides,
      httpsCertificateArn,
    } = props;

    const vpc = props.vpc || new awsx.ec2.Vpc(`${name}-vpc`, {}, { parent: this });
    this.vpc = vpc;

    const cluster = new awsx.ecs.Cluster(`${name}-cluster`, { vpc }, { parent: this });
    this.cluster = cluster;

    const loadBalancer = new awsx.lb.ApplicationLoadBalancer(`${name}-lb`, {
      external: true,
      securityGroups: cluster.securityGroups,
      vpc,
    }, { parent: this });
    this.loadBalancer = loadBalancer;

    const containerTarget = loadBalancer.createTargetGroup(`${name}-target`, {
      name: `${name}-target`.slice(0, 32),
      protocol: 'HTTP',
      port,
      ...(isEmpty(healthCheckUrl) ? {
        healthCheck: {
          path: healthCheckUrl,
          port: port.toString(),
          protocol: 'HTTP',
          interval: 15,
          healthyThreshold: 3,
          timeout: 5,
          unhealthyThreshold: 5,
          ...healthCheckOverrides,
        },
      } : {}),
    }, {
      parent: this,
      deleteBeforeReplace: true,
    });
    this.containerTarget = containerTarget;

    const httpListener = containerTarget.createListener(`${name}-http`, { external: true, port: 80 }, { parent: this });
    this.httpListener = httpListener;

    let httpsListener;
    if (httpsCertificateArn) {
      httpsListener = containerTarget.createListener(`${name}-https`, {
        external: true,
        port: 443,
        certificateArn: httpsCertificateArn,
      }, { parent: this });
    }

    const role = new aws.iam.Role(`${name}-dpl-role`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: [
          'ecs-tasks.amazonaws.com',
          'ecs.amazonaws.com',
        ],
      }),
    }, { parent: this });
    this.role = role;

    const rolePolicyAttachment = new aws.iam.RolePolicyAttachment(`${name}-rpa`, {
      policyArn,
      role,
    }, { parent: this });
    this.rolePolicyAttachment = rolePolicyAttachment;

    let environment = _environment;
    if (isFunction(_environment)) {
      environment = _environment({
        vpc,
        cluster,
        loadBalancer,
        containerTarget,
        httpListener,
      });
    }

    if (isObject(environment)) {
      environment = Object.entries(environment)
        .map(([entryName, entryValue]) => ({
          name: entryName,
          value: entryValue,
        }));
    }

    const service = new awsx.ecs.FargateService(`${name}-service`, {
      cluster,
      taskDefinitionArgs: {
        container: {
          image,
          portMappings: [containerTarget],
          environment,
          ...container,
        },
        executionRole: role,
      },
      desiredCount,
      waitForSteadyState: false,
    }, { parent: this });
    this.service = service;

    const asgTarget = new aws.appautoscaling.Target(`${name}-asg-target`, {
      maxCapacity,
      minCapacity,
      resourceId: pulumi.interpolate`service/${cluster.cluster.name}/${service.service.name}`,
      roleArn: role.arn,
      scalableDimension: 'ecs:service:DesiredCount',
      serviceNamespace: 'ecs',
    }, { parent: this });
    this.asgTarget = asgTarget;

    const asgCPUPolicy = new aws.appautoscaling.Policy(`${name}-asg-cpu-p`, {
      policyType: 'TargetTrackingScaling',
      resourceId: asgTarget.resourceId,
      scalableDimension: asgTarget.scalableDimension,
      serviceNamespace: asgTarget.serviceNamespace,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageCPUUtilization',
        },
        targetValue: cpuScalingValue,
      },
    }, { parent: this });
    this.asgCPUPolicy = asgCPUPolicy;

    const asgMemoryPolicy = new aws.appautoscaling.Policy(`${name}-asg-mem-p`, {
      policyType: 'TargetTrackingScaling',
      resourceId: asgTarget.resourceId,
      scalableDimension: asgTarget.scalableDimension,
      serviceNamespace: asgTarget.serviceNamespace,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
        },
        targetValue: memoryScalingValue,
      },
    }, { parent: this });
    this.asgMemoryPolicy = asgMemoryPolicy;

    this.registerOutputs(omitBy({
      vpc,
      cluster,
      loadBalancer,
      containerTarget,
      httpListener,
      httpsListener,
      service,
      role,
      rolePolicyAttachment,
      asgTarget,
      asgCPUPolicy,
      asgMemoryPolicy,
    }, isNil));
  }
}
