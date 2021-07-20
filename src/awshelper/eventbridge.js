'use strict';
const AWS = require('aws-sdk');

module.exports = ({ eventBus, source, detailType }) => ({
    put: async (events) => {
        const eventbridge = new AWS.EventBridge();
        let entries = [];
        for (let element of events) {
            entries.push({
                EventBusName: eventBus,
                Source: source,
                DetailType: detailType,
                Detail: JSON.stringify(element),
                Time: new Date()
            })
        }
        return await eventbridge.putEvents({ Entries: entries }).promise();
    },
});
