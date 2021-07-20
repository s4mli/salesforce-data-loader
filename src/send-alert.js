"use strict";
const fs = require("fs");
const uniqid = require("uniqid");
const moment = require("moment");
const s3 = require("awshelper/s3");
const mustache = require("mustache");
const base64Img = require("base64-img");
const mimeMessage = require("mimemessage");
const dynamo = require("awshelper/dynamodb");
const splunkLogger = require("@seek/splunk-logger");
const logger = new splunkLogger("salesforce-data-loader");

const updateReconJob = async (event) => {
    const allFailures = JSON.parse(
        await s3({
            region: process.env.REGION,
            roleArn: null
        }).read(event.failure.where)
    ), distinctFailures = allFailures.reduce(
        (distinctFailures, item) => {
            let failedMsg = item["sf__Error"],
                failedMsgArr = failedMsg.split(":");
            if (failedMsgArr.length > 3) {
                failedMsgArr.splice(2, failedMsgArr.length - 3);
                failedMsg = failedMsgArr.join(":");
            }
            if (failedMsg && !distinctFailures.includes(failedMsg)) {
                distinctFailures.push(failedMsg);
            }
            return distinctFailures;
        }, []
    ), reconJobTable = dynamo({
        region: process.env.REGION,
        tableName: process.env.TABLE
    }, "JobId", "FileName");
    const reconEndAt = moment().utcOffset("+10:00").format("DD MMM YYYY hh:mm A");
    await reconJobTable.update({
        JobId: event.jobInfo.id,
        FileName: event.jobInfo.file
    }, {
        ReconciliationEndAt: reconEndAt,
        SuccessfulCSV: `${event.success.csv.bucketName}/${event.success.csv.fileName}`,
        FailedCSV: `${event.failure.csv.bucketName}/${event.failure.csv.fileName}`,
        DistinctFailures: JSON.stringify(distinctFailures)
    });
    return { reconEndAt, distinctFailures };
}

const subjectFor = (jobId, state) => { return `SFDC DM: ${jobId} ${state}`; };
const emailContentFrom = async (htmlContent, data) => {
    let message = mimeMessage.factory({
        contentType: "multipart/mixed",
        body: []
    });
    message.header("Message-ID", `<${uniqid()}.SFDC-DM@${data.jobInfo.object}.${data.jobInfo.id}>`);
    message.header("MIME-Version", "1.0");
    message.header("Category", "GroupApps");
    message.header("Date", new Date().toUTCString().replace(/GMT/, "+0000"));
    message.header("Keywords", `SFDC,DM,${data.jobInfo.object}`);
    message.header("User-Agent", "SFDC-DM/1 APP");
    message.header("Subject", subjectFor(data.jobInfo.id, data.jobInfo.state));
    message.header("From", "ProjectRipleyDataMigrationSupport@seek.com.au");
    message.header("To", "ProjectRipleyDataMigrationTeam@seek.com.au");
    message.body.push(mimeMessage.factory({
        contentType: "text/html;charset=utf-8",
        body: htmlContent
    }));
    return message.toString("utf8")
}

exports.handler = async (event, context) => {
    let input = {
        ...event[0][0],
        ...(await updateReconJob(event[0][0]))
    };
    const notificationBucket = JSON.parse(process.env.NOTIFICATION),
        data = {
            ...input,
            ...{
                logo_base64: base64Img.base64Sync("./logo.png"),
                bucket: process.env.BUCKET,
                settingObject: `${input.setting.toUpperCase()} - ${input.jobInfo.object}`,
                sandbox: process.env.SANDBOX,
                whereSuccess: input.success.csv.fileName,
                whereFailure: input.failure.csv.fileName,
                hasErrorMessage: (input.jobInfo.errorMessage && input.jobInfo.errorMessage.length > 0),
                distinctFailures: input.distinctFailures.map((item, index) => {
                    return { message: item, withTitle: index === 0 };
                })
            }
        };
    if (data.hasErrorMessage || data.distinctFailures.length > 0) {
        let jobFailuresInLog = {
            JobId: input.jobInfo.id,
            Object: data.settingObject,
            Operation: input.jobInfo.operation,
            Processed: input.jobInfo.numberRecordsProcessed,
            Failed: input.jobInfo.numberRecordsFailed,
            FileS3: `s3://${input.bucketName}/${input.fileName}`
        };
        if (data.hasErrorMessage) {
            jobFailuresInLog.Reason = input.jobInfo.errorMessage;
        }
        if (data.distinctFailures.length > 0) {
            jobFailuresInLog.Failures = input.distinctFailures;
        }
        logger.warn({ alert: jobFailuresInLog });
    }
    const htmlContent = mustache.render(fs.readFileSync("./alert.html", "utf8"), data),
        emailContent = await emailContentFrom(htmlContent, data);
    input.alert = await s3({
        region: process.env.REGION,
        roleArn: null
    }).write({
        bucketName: process.env.BUCKET,
        fileName: input.fileName.replace(".csv", `_${input.jobInfo.id}_alert.html`),
        body: htmlContent
    });
    input.sent = await s3(notificationBucket).write({
        bucketName: notificationBucket.bucketName,
        fileName: notificationBucket.filePath + uniqid(),
        body: emailContent
    });
    return input;
};
