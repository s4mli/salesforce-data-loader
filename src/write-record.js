const s3 = require("awshelper/s3");
const u = require("awshelper/util");
const csvToJson = require("csvtojson");
const dynamo = require("awshelper/dynamodb");
const splunkLogger = require("@seek/splunk-logger");
const logger = new splunkLogger("salesforce-data-loader");

const transform = (data) => {
  let keysToRemove = [];
  for (let key of Object.keys(data)) {
    if ("object" === typeof data[key]) {
      for (let ck of Object.keys(data[key])) {
        const field = `${key}.${ck}`;
        data[field] = data[key][ck];
      }
      keysToRemove.push(key);
    }
  }
  for (let k of keysToRemove) {
    delete data[k];
  }
  return data;
};

module.exports = async (event, batch, region, tableName, itemFn) => {
  const reconTable = dynamo({
    region: region,
    tableName: tableName
  }, "Batch_Key", "Source_Id"),
    sourceData = (await csvToJson().fromString(
      (await s3({
        region: region,
        roleArn: null
      }).read(event)).toString()
    )).map(transform),
    keyField = event.jobInfo.externalIdFieldName,
    sourceDatakeys = Object.keys(sourceData[0]),
    usingKeyField = keyField && sourceDatakeys.includes(keyField),
    data = JSON.parse(await s3({
      region: region,
      roleArn: null
    }).read(event.where));
  for (let item of data.slice(event.group, event.group + batch)) {
    let sourceItem = {}, sourceItems = sourceData.filter(s => {
      for (let k of (usingKeyField ? [keyField] : sourceDatakeys)) {
        if (u.isDate(s[k]) || u.isDate(item[k])) {
          continue;
        } else if (u.isNumeric(s[k]) || u.isNumeric(item[k])) {
          if (parseFloat(s[k]) !== parseFloat(item[k])) {
            return false;
          }
        } else if (s[k].trim().toLowerCase() !== item[k].trim().toLowerCase()) {
          return false;
        }
      }
      return true;
    });
    if (sourceItems.length > 0) { sourceItem = sourceItems[0]; }
    const whatElse = itemFn ? itemFn(sourceItem, item) : { needed: false };
    if (whatElse.needed) {
      const uniqueId = usingKeyField ? item[keyField] : u.md5(JSON.stringify(sourceItem));
      delete whatElse["needed"];
      await reconTable.save({
        ...{
          Batch_Key: event.jobInfo.id + '_' + uniqueId,
          Source_Id: uniqueId,
          Job_Id: event.jobInfo.id,
          Object: `${event.setting.toUpperCase()} - ${event.jobInfo.object}`,
          Operation: event.jobInfo.operation,
          Source_Record: JSON.stringify(sourceItem),
        },
        ...whatElse
      });
    }
  }
  logger.info({ jobId: event.jobInfo.id, group: event.group, batch: batch });
};
