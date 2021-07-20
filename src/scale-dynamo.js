const AWS = require("aws-sdk");

const logTableDescription = (desc) => {
    const tableDescription = (k) => { return k.Table ?? k.TableDescription; };
    console.log(JSON.stringify(desc.map(k => {
        return {
            TableName: tableDescription(k).TableName,
            TableStatus: tableDescription(k).TableStatus,
            BillingModeSummary: tableDescription(k).BillingModeSummary,
            ProvisionedThroughput: tableDescription(k).ProvisionedThroughput,
            GlobalSecondaryIndexes: tableDescription(k).GlobalSecondaryIndexes.map(m => {
                return {
                    IndexName: m.IndexName,
                    ProvisionedThroughput: m.ProvisionedThroughput
                };
            })
        };
    }), null, 4));
};

const downscale = async (region, ...tableNames) => {
    const dc = new AWS.DynamoDB({ region }),
        desc = await Promise.all(tableNames.map(
            t => dc.describeTable({ TableName: t }).promise()
        ));
    logTableDescription(desc);
    const done = await Promise.all(tableNames.map(
        t => dc.updateTable({ TableName: t, BillingMode: "PAY_PER_REQUEST" }).promise()
    ));
    logTableDescription(done);
    return done;
};

module.exports = {
    down: async () => {
        return await downscale(process.env.REGION,
            ...JSON.parse(process.env.TABLE_NAMES)
        );
    },

    up: async () => { }
};
