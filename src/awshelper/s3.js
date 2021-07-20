'use strict';
const AWS = require('aws-sdk');
const sts = require('./sts');

const s3clientFrom = async (region, roleArn) => {
    if (roleArn) {
        let tempCredentials = await sts({ region: region }).assume({ roleArn });
        return new AWS.S3({ ...tempCredentials, ...{ region: region } });
    } else {
        return new AWS.S3({ region: region });
    }
}

module.exports = ({ region, roleArn = null }) => ({
    list: async ({ bucketName, prefix }, contentsFilter = null, contentsMapper = null) => {
        const s3 = await s3clientFrom(region, roleArn);
        let param = { Bucket: bucketName, Prefix: prefix },
            items = [];
        while (true) {
            let s = await s3.listObjectsV2(param).promise(),
                contents = contentsFilter ?
                    s.Contents.filter(item => contentsFilter(item)) :
                    s.Contents;
            items = items.concat(
                contentsMapper ?
                    contents.map(item => contentsMapper(item)) :
                    contents
            );
            if (s.IsTruncated && s.NextContinuationToken) {
                param.ContinuationToken = s.NextContinuationToken;
            } else {
                break;
            }
        }
        return items;
    },
    delete: async ({ bucketName, fileName }) => {
        const s3 = await s3clientFrom(region, roleArn);
        return await s3.deleteObject({
            Bucket: bucketName,
            Key: fileName
        }).promise();
    },

    write: async ({ bucketName, fileName, body, encoding = "utf8" }) => {
        const s3 = await s3clientFrom(region, roleArn);
        await s3.putObject({
            Bucket: bucketName,
            Key: fileName,
            Body: Buffer.from(body, encoding)
        }).promise();
        return {
            region: region,
            roleArn: roleArn,
            bucketName: bucketName,
            fileName: fileName
        };
    },

    read: async ({ bucketName, fileName }) => {
        const s3 = await s3clientFrom(region, roleArn),
            data = await s3.getObject({
                Bucket: bucketName,
                Key: fileName
            }).promise();
        return data.Body;
    },

    copy: async ({ sourceBucketName, sourceFileName }, { targetBucketName, targetFileName }) => {
        const s3 = await s3clientFrom(region, roleArn);
        return await s3.copyObject({
            Bucket: targetBucketName,
            Key: targetFileName,
            CopySource: `/${sourceBucketName}/${sourceFileName}`
        }).promise();
    }
});
