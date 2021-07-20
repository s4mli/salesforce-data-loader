const moment = require("moment");
const s3 = require("awshelper/s3");
const dynamo = require("awshelper/dynamodb");
const splunkLogger = require("@seek/splunk-logger");
const logger = new splunkLogger("salesforce-data-loader");

exports.handler = async (event, context) => {
  const fileNameArr = event.fileName.split("/"),
    s3Service = s3({ region: process.env.REGION, roleArn: null }),
    reconJobTable = dynamo({
      region: process.env.REGION,
      tableName: process.env.TABLE
    }, "JobId", "FileName");
  let summary = {
    JobId: event.jobInfo.id,
    FileName: fileNameArr[fileNameArr.length - 1],
    Object: `${event.setting.toUpperCase()} - ${event.jobInfo.object}`,
    Operation: event.jobInfo.operation,
    Processed: event.jobInfo.numberRecordsProcessed,
    Failed: event.jobInfo.numberRecordsFailed,
    JobBeginAt: event.beginAt,
    JobEndAt: moment().utcOffset("+10:00").format("DD MMM YYYY hh:mm A"),
    OriginalCSV: `${process.env.BUCKET}/${event.fileName}`,
  };
  if (event.jobInfo.errorMessage || event.jobInfo.numberRecordsFailed > 0) {
    summary.Status = "Failed";
    if (event.jobInfo.errorMessage) {
      summary.Reason = event.jobInfo.errorMessage;
    }
  } else {
    summary.Status = "Successful";
  }
  logger.info({ summary });
  await reconJobTable.save(summary);
  await s3Service.copy({
    sourceBucketName: event.bucketName,
    sourceFileName: event.fileName
  }, {
    targetBucketName: process.env.BUCKET,
    targetFileName: event.fileName
  });
  await s3Service.delete(event);
  event.bucketName = process.env.BUCKET;
  event.jobInfo = {
    ...event.jobInfo,
    ...{
      file: summary.FileName,
      endAt: summary.JobEndAt,
      status: summary.Status,
      beginAt: summary.JobBeginAt
    }
  };
  return event;
};


