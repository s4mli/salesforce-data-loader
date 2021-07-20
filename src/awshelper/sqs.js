'use strict';
const AWS = require('aws-sdk');

module.exports = ({ region, queueUrl }) => ({
    read: async ({ maxNumberOfMessages, waitTimeSeconds }, messageAsyncHandlerFn) => {
        const sqs = new AWS.SQS({ region: region }),
            handleMessage = async (message) => {
                if (messageAsyncHandlerFn) {
                    await messageAsyncHandlerFn(message.Body, message.MessageAttributes);
                }
                await sqs.deleteMessage({
                    QueueUrl: queueUrl,
                    ReceiptHandle: message.ReceiptHandle
                }).promise();
                return Promise.resolve(message);
            },
            msgs = await sqs.receiveMessage({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: maxNumberOfMessages,
                WaitTimeSeconds: waitTimeSeconds,
            }).promise();
        if (!msgs.Messages || msgs.Messages.length === 0) {
            return false;
        } else {
            return await Promise.all(msgs.Messages.map(handleMessage));
        }
    },

    send: async (body, attributes) => {
        const sqs = new AWS.SQS({ region: region }),
            sent = await sqs.sendMessage({
                QueueUrl: queueUrl,
                MessageBody: body,
                MessageAttributes: attributes
            }).promise();
        return sent.MessageId;
    }
});
