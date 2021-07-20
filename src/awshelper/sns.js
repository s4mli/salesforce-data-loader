'use strict';
const AWS = require('aws-sdk');

module.exports = ({ region, topicArn }) => ({
    publish: async (message, messageAttributes, subject) => {
        const sns = new AWS.SNS({ region: region });
        return await sns.publish({
            Message: JSON.stringify(message),
            MessageAttributes: messageAttributes,
            Subject: subject,
            TopicArn: topicArn
        }).promise();
    }
});
