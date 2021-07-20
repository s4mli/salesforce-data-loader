const util = require("util");
const moment = require("moment");
const jsforce = require("jsforce");
const sm = require("awshelper/sm");
const s3 = require("awshelper/s3");
const splunkLogger = require("@seek/splunk-logger");
const logger = new splunkLogger("salesforce-data-loader");

const upload2SfV2 = async (event, objectName, extIdField, operation) => {
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
    payload = {
      "object": objectName,
      "contentType": "CSV",
      "operation": operation,
      "lineEnding": event.lineEnding ? event.lineEnding : "LF"
    };
  if ("upsert" === operation && extIdField) {
    payload.externalIdFieldName = extIdField;
  }
  const jobResp = await conn.request({
    url: sfUrl + "jobs/ingest",
    method: "POST",
    headers: {
      ...logedin,
      "Content-Type": "application/json; charset=UTF-8",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const jobId = jobResp.id;
  await conn.request({
    url: sfUrl + `jobs/ingest/${jobId}/batches/`,
    method: "PUT",
    headers: {
      ...logedin,
      "Content-Type": "text/csv",
      "Accept": "application/json"
    },
    body: (await s3({
      region: process.env.REGION,
      roleArn: null
    }).read(event)).toString()
  });

  const patchResp = await conn.request({
    url: sfUrl + `jobs/ingest/${jobId}/`,
    method: "PATCH",
    headers: {
      ...logedin,
      "Content-Type": "application/json; charset=UTF-8",
      "Accept": "application/json"
    },
    body: JSON.stringify({ state: "UploadComplete" })
  });
  return patchResp;
};

exports.handler = async (event, context) => {
  const objectMappings = JSON.parse(process.env.OBJECTMAPPINGS);
  event.beginAt = moment().utcOffset("+10:00").format("DD MMM YYYY hh:mm A");
  if (objectMappings && objectMappings[event.folder.toLowerCase()]) {
    const setting = event.setting.toLowerCase(),
      objectName = objectMappings[event.folder.toLowerCase()],
      objectKey = JSON.parse(process.env.OBJECTKEY),
      extIdField = objectKey[setting] ? objectKey[setting][objectName] : null;
    event.jobInfo = await upload2SfV2(event, objectName, extIdField, event.operation);
    logger.info({
      setting: setting,
      object: objectName,
      externalId: extIdField,
      RunningJob: event.jobInfo
    });
    return event;
  }
};
