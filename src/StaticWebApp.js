import pulumi from '@pulumi/pulumi';
import aws from '@pulumi/aws';
import readdirp from 'recursive-readdir-sync';
import mime from 'mime';
import cp from 'child_process';
import isEmpty from 'lodash/isEmpty';

export default class StaticWebApp extends pulumi.ComponentResource {
  constructor(name, props = {}, ops) {
    super('umble:staticWebApp:StaticWebApp', name, {}, ops);

    const {
      buildDir,
      buildCmd,
      environment = {},
      useCDN = false,
    } = props;

    if (!buildDir) throw new Error('buildDir is required!');

    const bucket = new aws.s3.Bucket(`${name}-s3`, {
      website: {
        indexDocument: 'index.html',
        errorDocument: 'index.html',
      },
      forceDestroy: true,
    }, { parent: this });
    this.bucket = bucket;

    const policy = new aws.s3.BucketPolicy(`${name}-s3-policy`, {
      bucket: bucket.bucket,
      policy: bucket.bucket.apply((bucketName) => ({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: '*',
          Action: [
            's3:GetObject',
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}/*`,
          ],
        }],
      })),
    }, { parent: this });
    this.policy = policy;

    let cdn;
    if (useCDN) {
      cdn = new aws.cloudfront.Distribution(`${name}-cdn`, {
        enabled: true,
        waitForDeployment: false,
        origins: [
          {
            originId: bucket.arn,
            domainName: bucket.websiteEndpoint,
            customOriginConfig: {
              originProtocolPolicy: 'http-only',
              httpPort: 80,
              httpsPort: 443,
              originSslProtocols: ['TLSv1.2'],
            },
          },
        ],
        defaultRootObject: 'index.html',
        defaultCacheBehavior: {
          targetOriginId: bucket.arn,
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
          cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
          forwardedValues: {
            cookies: { forward: 'none' },
            queryString: false,
          },
          minTtl: 0,
          defaultTtl: 60 * 10,
          maxTtl: 60 * 10,
        },
        priceClass: 'PriceClass_100',
        restrictions: {
          geoRestriction: {
            restrictionType: 'none',
          },
        },
        viewerCertificate: {
          cloudfrontDefaultCertificate: true,
        },
      }, { parent: this });
      this.cdn = cdn;
    }

    const hasBuildCmd = !isEmpty(buildCmd);

    if (hasBuildCmd) {
      const envKeys = [];
      const envValues = Object.entries(environment)
        .map(([key, value]) => {
          envKeys.push(key);
          return value.__pulumiOutput ? value : pulumi.output(value);
        });

      const _build = pulumi.all(envValues).apply((evs) => {
        const environmentVariablesString = evs
          .map((ev, idx) => `${envKeys[idx]}='${ev}'`)
          .join(' ');

        return `${environmentVariablesString} bash -c '${buildCmd}'`;
      });

      pulumi.all([_build, bucket.bucket]).apply((r) => {
        const [build] = r;

        cp.execSync(build);
        // NOTE: Resource creation is currently allowed after apply
        // but discouraged for obvious reasons
        // Previews will not be accurate
        /* eslint-disable */
        for (const dir of readdirp(buildDir)) {
          new aws.s3.BucketObject(dir, {
            bucket,
            source: new pulumi.asset.FileAsset(dir),
            key: dir.replace(buildDir, ''),
            contentType: mime.getType(dir) || undefined,
          }, { parent: this });
        }
        /* eslint-enable */
      });
    } else {
      /* eslint-disable */
      for (const dir of readdirp(buildDir)) {
        new aws.s3.BucketObject(dir, { 
          bucket,
          source: new pulumi.asset.FileAsset(dir),
          key: dir.replace(buildDir, ''),
          contentType: mime.getType(dir) || undefined,
        }, { parent: this });
      }
      /* eslint-enable */
    }

    this.registerOutputs({
      bucket: this.bucket,
      policy: this.policy,
      cdn: this.cdn,
    });
  }
}
