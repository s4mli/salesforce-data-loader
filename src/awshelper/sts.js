'use strict';
const AWS = require('aws-sdk');
const moment = require('moment');

module.exports = ({ region }) => ({
    assume: async ({ roleArn, externalId = "", roleSessionName = "" }) => {
        const roleInfo = moment().format("YYYY-MM-DD-HH-mm-ss-SSSZZ"),
            sts = new AWS.STS({ region: region }),
            params = {
                RoleArn: roleArn,
                DurationSeconds: 900,
                ExternalId: externalId ? externalId : roleInfo,
                RoleSessionName: roleSessionName ? roleSessionName : roleInfo
            },
            tempCred = await sts.assumeRole(params).promise();
        return {
            accessKeyId: tempCred.Credentials.AccessKeyId,
            secretAccessKey: tempCred.Credentials.SecretAccessKey,
            sessionToken: tempCred.Credentials.SessionToken
        };
    }
});
