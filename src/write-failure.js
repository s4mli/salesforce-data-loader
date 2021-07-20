const write = require("./write-record");

exports.handler = async (event, context) => {
    await write(event, event.batch, process.env.REGION,
        process.env.TABLE, (sourceItem, item) => {
            return {
                needed: true,
                SF_Id: "-",
                Failed: item["sf__Error"]
            };
        }
    );
};
