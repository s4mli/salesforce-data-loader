const util = require("util");
const AWS = require("aws-sdk");
const s3 = require("awshelper/s3");
const sm = require("awshelper/sm");
const jsforce = require("jsforce");
const json2Csv = require("json2csv");
const splunkLogger = require("@seek/splunk-logger");
const logger = new splunkLogger("salesforce-data-loader");

const fetchJobResult = async (event) => {
    const s3s = s3({ region: process.env.REGION, roleArn: null }),
        { user, password, token } = await sm({ region: process.env.REGION, secretId: process.env.SECRET }).get(),
        conn = new jsforce.Connection({ version: process.env.APIVERSION, loginUrl: process.env.LOGINURL }),
        logedin = await conn.login(user, password + token);
    logger.info({ user: logedin });
    delete logedin["url"];
    const sfUrl = util.format(process.env.SERVICEURL, process.env.APIVERSION);
    let success = [], failure = [];
    try {
        success = await conn.request({
            url: sfUrl + `jobs/ingest/${event.jobInfo.id}/successfulResults/`,
            method: "GET",
            headers: {
                ...logedin,
                "Content-Type": "application/json; charset=UTF-8",
                "Accept": "text/csv"
            },
            body: ""
        });
        failure = await conn.request({
            url: sfUrl + `jobs/ingest/${event.jobInfo.id}/failedResults/`,
            method: "GET",
            headers: {
                ...logedin,
                "Content-Type": "application/json; charset=UTF-8",
                "Accept": "text/csv"
            },
            body: ""
        });
    } catch (err) {
        logger.error({ error: err });
    } finally {
        logger.info({ jobId: event.jobInfo.id, success: success.length, failure: failure.length });
        let successGroups = [], failureGroups = [];
        for (let i = 0; i < success.length; i += parseInt(process.env.BATCH)) {
            successGroups.push(i);
        }
        for (let j = 0; j < failure.length; j += parseInt(process.env.BATCH)) {
            failureGroups.push(j);
        }
        const s3Raw = new AWS.S3();
        return {
            batch: parseInt(process.env.BATCH),
            bypass: { groups: [0] },
            success: {
                count: success.length,
                where: await s3s.write({
                    bucketName: process.env.BUCKET,
                    fileName: event.fileName.replace(".csv", `_${event.jobInfo.id}_success.json`),
                    body: JSON.stringify(success)
                }),
                csv: {
                    bucketName: process.env.BUCKET,
                    fileName: event.fileName.replace(".csv", `_${event.jobInfo.id}_success.csv`),
                    done: await s3Raw.putObject({
                        Bucket: process.env.BUCKET,
                        Key: event.fileName.replace(".csv", `_${event.jobInfo.id}_success.csv`),
                        Body: await json2Csv.parseAsync(
                            success, {}, { objectMode: true }
                        )
                    }).promise()
                },
                groups: successGroups,
            },
            failure: {
                count: failure.length,
                where: await s3s.write({
                    bucketName: process.env.BUCKET,
                    fileName: event.fileName.replace(".csv", `_${event.jobInfo.id}_failure.json`),
                    body: JSON.stringify(failure)
                }),
                csv: {
                    bucketName: process.env.BUCKET,
                    fileName: event.fileName.replace(".csv", `_${event.jobInfo.id}_failure.csv`),
                    done: await s3Raw.putObject({
                        Bucket: process.env.BUCKET,
                        Key: event.fileName.replace(".csv", `_${event.jobInfo.id}_failure.csv`),
                        Body: await json2Csv.parseAsync(
                            failure, {}, { objectMode: true }
                        )
                    }).promise()
                },
                groups: failureGroups,
            }
        };
    }
};

exports.handler = async (event, context) => {
    event = { ...event, ...(await fetchJobResult(event)) };
    return event;
};
