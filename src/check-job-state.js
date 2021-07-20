const util = require("util");
const jsforce = require("jsforce");
const sm = require("awshelper/sm");
const u = require("awshelper/util");
const splunkLogger = require("@seek/splunk-logger");
const logger = new splunkLogger("salesforce-data-loader");

exports.handler = async (event, context) => {
    try {
        const { user, password, token } = await sm({
            region: process.env.REGION,
            secretId: process.env.SECRET
        }).get(), conn = new jsforce.Connection({
            version: process.env.APIVERSION,
            loginUrl: process.env.LOGINURL
        }), logedin = await conn.login(user, password + token);
        logger.info({ user: logedin });
        delete logedin["url"];

        const sfUrl = util.format(process.env.SERVICEURL, process.env.APIVERSION),
            checkResp = await conn.request({
                url: sfUrl + `jobs/ingest/${event.jobInfo.id}/`,
                method: "GET",
                headers: {
                    ...logedin,
                    "Content-Type": "application/json; charset=UTF-8",
                    "Accept": "application/json"
                },
                body: ""
            });
        event.jobInfo = u.pick(checkResp, "id", "operation", "object", "state",
            "errorMessage", "externalIdFieldName", "numberRecordsProcessed",
            "numberRecordsFailed", "apiVersion");
        logger.info({ jobInfo: event.jobInfo });
    } catch (err) {
        logger.error({ error: err });
    } finally {
        return event;
    }
};
