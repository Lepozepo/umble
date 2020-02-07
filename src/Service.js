import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import awsx from '@pulumi/awsx';
import tls from '@pulumi/tls';
import {
  isFunction,
  isObject,
  isNil,
  omitBy,
} from 'lodash';

export default class Service extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:service:Service', name, {}, ops);

    const {
      image,
      environment: _environment,
      memory = 512,
      exposePort: port = 4000,
      useSelfSignedSSL = false,
      policyArn = aws.iam.AdministratorAccess,
    } = props;

    const vpc = props.vpc || awsx.ec2.Vpc.getDefault() || new awsx.ec2.Vpc(`${name}-vpc`, {}, { parent: this });
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
      healthCheck: {
        path: '/.well-known/apollo/server-health',
        port: port.toString(),
        protocol: 'HTTP',
        interval: 15,
        healthyThreshold: 3,
        timeout: 5,
        unhealthyThreshold: 5,
      },
    }, {
      parent: this,
      deleteBeforeReplace: true,
    });
    this.containerTarget = containerTarget;

    const httpListener = containerTarget.createListener(`${name}-http`, { port: 80 }, { parent: this });
    this.httpListener = httpListener;

    let httpsListener;
    if (useSelfSignedSSL) {
      const privateKey = new tls.PrivateKey(`${name}-pk`, {
        algorithm: 'RSA',
      }, { parent: this });

      const selfSignedCert = new tls.SelfSignedCert(`${name}-certbody`, {
        allowedUses: [
          'keyEncipherment',
          'digitalSignature',
          'serverAuth',
        ],
        keyAlgorithm: 'RSA',
        privateKeyPem: privateKey.privateKeyPem,
        subjects: [{
          commonName: '*.amazonaws.com',
          organization: 'differential',
        }],
        validityPeriodHours: 8640,
      }, { parent: this });

      const cert = new aws.acm.Certificate(`${name}-cert`, {
        certificateBody: selfSignedCert.certPem,
        privateKey: privateKey.privateKeyPem,
      }, { parent: this });

      httpsListener = containerTarget.createListener(`${name}-https`, {
        port: 443,
        certificateArn: cert.arn,
        sslPolicy: 'ELBSecurityPolicy-2016-08',
      }, { parent: this });
      this.httpsListener = httpsListener;
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
          memory,
          portMappings: [containerTarget],
          environment,
        },
        executionRole: role,
      },
      desiredCount: 1,
      waitForSteadyState: false,
    }, { parent: this });
    this.service = service;

    const asgTarget = new aws.appautoscaling.Target(`${name}-asg-target`, {
      maxCapacity: 4,
      minCapacity: 1,
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
        targetValue: 70,
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
        targetValue: 70,
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
