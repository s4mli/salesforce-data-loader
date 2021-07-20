import core = require("@aws-cdk/core");
import s3 = require("@aws-cdk/aws-s3");
import iam = require("@aws-cdk/aws-iam");
import ssm = require("@aws-cdk/aws-ssm");
import db = require("@aws-cdk/aws-dynamodb");
import lambda = require("@aws-cdk/aws-lambda");
import events = require("@aws-cdk/aws-events");
import targets = require("@aws-cdk/aws-events-targets");
import sm = require("@aws-cdk/aws-secretsmanager");
import sfn = require("@aws-cdk/aws-stepfunctions");
import s3n = require("@aws-cdk/aws-s3-notifications");
import task = require("@aws-cdk/aws-stepfunctions-tasks");

export interface DataLoaderServiceStackProps extends core.StackProps {
  awsEnv?: string;
  region?: string;
  tableName?: string
  sfLoginUrl?: string;
  sfAPIVersion?: string;
  sfServiceUrl?: string;
  secretName?: string;
  bucketName?: string;
  stateMachine?: string;
  int9BucketName?: string;
  archiveBucketName?: string;
  tags?: {
    [key: string]: string;
  };
  objectMappings?: {
    [key: string]: string;
  };
  objectKeyField?: {
    [key: string]: {
      [key: string]: string;
    }
  };
  notificationBucket?: {
    [key: string]: string;
  }
};

export class DataLoaderService extends core.Construct {
  constructor(scope: core.Construct, id: string, props: DataLoaderServiceStackProps) {
    super(scope, id);
    const prefix = id + "-",
      secrets = new sm.Secret(this, prefix + props.secretName, {
        secretName: prefix + props.secretName,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            user: "user",
            token: "token"
          }),
          generateStringKey: "password"
        }
      }), bucket = new s3.Bucket(this, prefix + props.bucketName, {
        bucketName: prefix + props.bucketName
      }), archivebucket = new s3.Bucket(this, prefix + props.archiveBucketName, {
        bucketName: prefix + props.archiveBucketName,
        lifecycleRules: [{
          expiration: core.Duration.days(30)
        }]
      }), int9Bucket = new s3.Bucket(this, prefix + props.int9BucketName, {
        bucketName: prefix + props.int9BucketName
      });

    const reconciliationTable = new db.Table(this, prefix + props.tableName, {
      tableName: prefix + props.tableName,
      partitionKey: {
        name: 'Batch_Key',
        type: db.AttributeType.STRING
      },
      sortKey: {
        name: 'Source_Id',
        type: db.AttributeType.STRING
      },
      billingMode: db.BillingMode.PAY_PER_REQUEST
    }), reconciliationJobTable = new db.Table(this, prefix + props.tableName + "-job", {
      tableName: prefix + props.tableName + "-job",
      partitionKey: {
        name: 'JobId',
        type: db.AttributeType.STRING
      },
      sortKey: {
        name: 'FileName',
        type: db.AttributeType.STRING
      },
      billingMode: db.BillingMode.PAY_PER_REQUEST
    });
    const lambdaLayerHelper = new lambda.LayerVersion(this, "sfdc-data-migration-helper-" + props.awsEnv, {
      code: lambda.Code.fromAsset("resources/helper"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      layerVersionName: "sfdc-data-migration-helper-" + props.awsEnv
    }), layerSsm = new ssm.StringParameter(this, prefix + "layer-latest", {
      parameterName: `/ripley/layer-${props.awsEnv}/latest`,
      stringValue: lambdaLayerHelper.layerVersionArn
    }), lambdaUploadSf = new lambda.Function(this, prefix + "upload-sf", {
      functionName: prefix + "upload-sf",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "upload-salesforce.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "SECRET": secrets.secretArn,
        "BUCKET": archivebucket.bucketName,
        "LOGINURL": props.sfLoginUrl || "https://seek--devint.my.salesforce.com",
        "APIVERSION": props.sfAPIVersion || "48.0",
        "SERVICEURL": props.sfServiceUrl || "https://cs152.salesforce.com/services/data/v%s/",
        "OBJECTMAPPINGS": JSON.stringify(props.objectMappings),
        "OBJECTKEY": JSON.stringify(props.objectKeyField)
      }
    }), lambdaArchive = new lambda.Function(this, prefix + "archive", {
      functionName: prefix + "archive",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "archive.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "BUCKET": archivebucket.bucketName,
        "TABLE": reconciliationJobTable.tableName,
      }
    }), lambdaCheckJobState = new lambda.Function(this, prefix + "check-job-state", {
      functionName: prefix + "check-job-state",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "check-job-state.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "SECRET": secrets.secretArn,
        "LOGINURL": props.sfLoginUrl || "https://seek--devint.my.salesforce.com",
        "APIVERSION": props.sfAPIVersion || "48.0",
        "SERVICEURL": props.sfServiceUrl || "https://cs152.salesforce.com/services/data/v%s/"
      }
    }), lambdaFetchJobResult = new lambda.Function(this, prefix + "fetch-job-result", {
      functionName: prefix + "fetch-job-result",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "fetch-job-result.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "BATCH": "5000",
        "REGION": props.env?.region || "ap-southeast-2",
        "SECRET": secrets.secretArn,
        "BUCKET": archivebucket.bucketName,
        "LOGINURL": props.sfLoginUrl || "https://seek--devint.my.salesforce.com",
        "APIVERSION": props.sfAPIVersion || "48.0",
        "SERVICEURL": props.sfServiceUrl || "https://cs152.salesforce.com/services/data/v%s/"
      }
    }), lambdaWriteFailure = new lambda.Function(this, prefix + "write-failure", {
      functionName: prefix + "write-failure",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "write-failure.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "SECRET": secrets.secretArn,
        "BUCKET": archivebucket.bucketName,
        "TABLE": reconciliationTable.tableName,
        "LOGINURL": props.sfLoginUrl || "https://seek--devint.my.salesforce.com",
        "APIVERSION": props.sfAPIVersion || "48.0",
        "SERVICEURL": props.sfServiceUrl || "https://cs152.salesforce.com/services/data/v%s/"
      }
    }), lambdaBypass = new lambda.Function(this, prefix + "bypass", {
      functionName: prefix + "bypass",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "bypass.handler",
      timeout: core.Duration.minutes(5)
    }), lambdaSendAlert = new lambda.Function(this, prefix + "send-alert", {
      functionName: prefix + "send-alert",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "send-alert.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "BUCKET": archivebucket.bucketName,
        "SANDBOX": "https://cs152.salesforce.com/",
        "TABLE": reconciliationJobTable.tableName,
        "NOTIFICATION": JSON.stringify(props.notificationBucket)
      }
    }), lambdaDpMover = new lambda.Function(this, prefix + "int9-mover", {
      functionName: prefix + "int9-mover",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "dp-mover.handler",
      timeout: core.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "BUCKET": bucket.bucketName
      }
    }), lambdaScaleDownDynamo = new lambda.Function(this, prefix + "scaledown-dynamo", {
      functionName: prefix + "scaledown-dynamo",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "scale-dynamo.down",
      timeout: core.Duration.minutes(15),
      memorySize: 256,
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "TABLE_NAMES": JSON.stringify([
          reconciliationTable.tableName,
          reconciliationJobTable.tableName
        ])
      }
    });
    const failureMap = new sfn.Map(this, prefix + "write-failure-map", {
      itemsPath: "$.failure.groups",
      parameters: {
        "group.$": "$$.Map.Item.Value",
        "csv.$": "$.failure.csv",
        "count.$": "$.failure.count",
        "where.$": "$.failure.where",
        "setting.$": "$.setting",
        "jobInfo.$": "$.jobInfo",
        "bucketName.$": "$.bucketName",
        "fileName.$": "$.fileName",
        "batch.$": "$.batch"
      }
    }).iterator(new task.LambdaInvoke(this, prefix + "write-failure-step", {
      lambdaFunction: lambdaWriteFailure,
      payloadResponseOnly: true
    }));
    const bypassMap = new sfn.Map(this, prefix + "bypass-map", {
      itemsPath: "$.bypass.groups",
      parameters: {
        "group.$": "$$.Map.Item.Value",
        "bucketName.$": "$.bucketName",
        "fileName.$": "$.fileName",
        "jobInfo.$": "$.jobInfo",
        "folder.$": "$.folder",
        "setting.$": "$.setting",
        "beginAt.$": "$.beginAt",
        "success.$": "$.success",
        "failure.$": "$.failure",
      }
    }).iterator(new task.LambdaInvoke(this, prefix + "bypass-map-step", {
      lambdaFunction: lambdaBypass,
      payloadResponseOnly: true
    }));
    const waitJobStep = new sfn.Wait(this, "wait-job-complete", {
      time: sfn.WaitTime.duration(core.Duration.seconds(180))
    }), checkJobTask = new task.LambdaInvoke(this, prefix + "check-job-state-step", {
      lambdaFunction: lambdaCheckJobState,
      payloadResponseOnly: true
    }), jobStateChoice = new sfn.Choice(this, prefix + "job-state-choice").when(
      sfn.Condition.or(
        sfn.Condition.stringEquals("$.jobInfo.state", "JobComplete"),
        sfn.Condition.stringEquals("$.jobInfo.state", "Failed")
      ), new task.LambdaInvoke(this, prefix + "fetch-job-result-step", {
        lambdaFunction: lambdaFetchJobResult,
        payloadResponseOnly: true
      }).addRetry({ maxAttempts: 5, backoffRate: 2 }).next(
        new task.LambdaInvoke(this, prefix + "archive-step", {
          lambdaFunction: lambdaArchive,
          payloadResponseOnly: true
        })
      ).next(
        new sfn.Parallel(this, prefix + "write-results").branch(
          bypassMap, failureMap)
      ).next(
        new task.LambdaInvoke(this, prefix + "send-alert-step", {
          lambdaFunction: lambdaSendAlert,
          payloadResponseOnly: true
        })
      )
    ).otherwise(waitJobStep.next(checkJobTask));
    const dataLoaderSm = new sfn.StateMachine(this, id, {
      definition: new task.LambdaInvoke(this, prefix + "upload-sf-step", {
        lambdaFunction: lambdaUploadSf,
        payloadResponseOnly: true
      }).next(checkJobTask.addCatch(waitJobStep)).next(jobStateChoice),
      stateMachineName: id
    }), lambdaTriggerStepFunction = new lambda.Function(this, prefix + "s3-trigger", {
      functionName: prefix + "s3-trigger",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "s3-trigger.handler",
      timeout: core.Duration.minutes(15),
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "STATENACHINE": dataLoaderSm.stateMachineArn
      }
    });
    for (let lambda of [
      lambdaUploadSf, lambdaArchive, lambdaCheckJobState, lambdaScaleDownDynamo,
      lambdaFetchJobResult, lambdaWriteFailure, lambdaSendAlert, lambdaDpMover
    ]) {
      lambda.addLayers(lambdaLayerHelper)
      secrets.grantRead(lambda);
      bucket.grantReadWrite(lambda);
      bucket.grantDelete(lambda);
      int9Bucket.grantReadWrite(lambda);
      int9Bucket.grantDelete(lambda);
      archivebucket.grantReadWrite(lambda);
      reconciliationTable.grantFullAccess(lambda);
      reconciliationJobTable.grantFullAccess(lambda);
    }
    int9Bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(lambdaDpMover));
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(lambdaTriggerStepFunction));

    const stsPolicy = new iam.PolicyStatement();
    stsPolicy.addActions("sts:*");
    stsPolicy.addResources(props.notificationBucket?.roleArn || "");
    lambdaSendAlert.role?.addToPrincipalPolicy(stsPolicy);
    s3.Bucket.fromBucketName(this, "notification-bucket", props.notificationBucket?.bucketName || "").grantWrite(lambdaSendAlert);
    dataLoaderSm.grantStartExecution(lambdaTriggerStepFunction);

    const eventRule = new events.Rule(this, 'scheduleRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '8', weekDay: "6" }),
    });
    eventRule.addTarget(new targets.LambdaFunction(lambdaScaleDownDynamo));
  }
}
