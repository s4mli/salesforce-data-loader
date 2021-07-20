import * as cdk from '@aws-cdk/core';
import * as config from '../lib/config.json';
import * as dataLoaderService from "./data-loader-service";

class DataLoaderServiceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: dataLoaderService.DataLoaderServiceStackProps) {
    super(scope, id, props);
    new dataLoaderService.DataLoaderService(this, id, props);
  }
};

const app = new cdk.App();
let stackQa = new DataLoaderServiceStack(app, config.qa.id, {
  awsEnv: "qa",
  tags: config.tags,
  tableName: config.tableName,
  secretName: config.secretName,
  bucketName: config.bucketName,
  sfLoginUrl: config.qa.sfLoginUrl,
  sfAPIVersion: config.qa.sfAPIVersion,
  sfServiceUrl: config.qa.sfServiceUrl,
  int9BucketName: config.int9BucketName,
  archiveBucketName: config.archiveBucketName,
  env: {
    account: config.qa.account,
    region: config.region
  },
  objectMappings: config.objectMappings,
  objectKeyField: config.objectKeyField,
  notificationBucket: config.qa.notificationBucket
});
let stackStaging = new DataLoaderServiceStack(app, config.staging.id, {
  awsEnv: "staging",
  tags: config.tags,
  tableName: config.tableName,
  secretName: config.secretName,
  bucketName: config.bucketName,
  sfLoginUrl: config.staging.sfLoginUrl,
  sfAPIVersion: config.staging.sfAPIVersion,
  sfServiceUrl: config.staging.sfServiceUrl,
  int9BucketName: config.int9BucketName,
  archiveBucketName: config.archiveBucketName,
  env: {
    account: config.staging.account,
    region: config.region
  },
  objectMappings: config.objectMappings,
  objectKeyField: config.objectKeyField,
  notificationBucket: config.staging.notificationBucket
});
let stackProd = new DataLoaderServiceStack(app, config.prod.id, {
  awsEnv: "prod",
  tags: config.tags,
  tableName: config.tableName,
  secretName: config.secretName,
  bucketName: config.bucketName,
  sfLoginUrl: config.prod.sfLoginUrl,
  sfAPIVersion: config.prod.sfAPIVersion,
  sfServiceUrl: config.prod.sfServiceUrl,
  int9BucketName: config.int9BucketName,
  archiveBucketName: config.archiveBucketName,
  env: {
    account: config.prod.account,
    region: config.region
  },
  objectMappings: config.objectMappings,
  objectKeyField: config.objectKeyField,
  notificationBucket: config.prod.notificationBucket
});

