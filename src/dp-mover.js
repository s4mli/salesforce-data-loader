const s3 = require("awshelper/s3");

exports.handler = async (event) => {
    if (event.Records[0].s3.object.key.includes(".csv")) {
        let fileNameArr = event.Records[0].s3.object.key.split("/"),
            fileName = fileNameArr[fileNameArr.length - 1],
            targetFileName = fileName.length > 20 ?
                `int9_${fileName.substr(0, 20)}.csv` :
                `int9_${fileName}`;
        fileNameArr.pop();
        fileNameArr.push(targetFileName);
        event.moved = await s3({
            region: process.env.REGION,
            roleArn: null
        }).copy({
            sourceBucketName: event.Records[0].s3.bucket.name,
            sourceFileName: event.Records[0].s3.object.key
        }, {
            targetBucketName: process.env.BUCKET,
            targetFileName: fileNameArr.join("/")
        });
    }
    return event;
};
