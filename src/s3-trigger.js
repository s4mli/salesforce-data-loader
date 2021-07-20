const aws = require("aws-sdk");
const stepFunctions = new aws.StepFunctions();

exports.handler = async (event) => {
  const bucketName = event.Records[0].s3.bucket.name,
    fileName = event.Records[0].s3.object.key,
    fileNameArr = fileName.split("/");
  if (fileNameArr[fileNameArr.length - 1].toLowerCase().includes(".csv")) {
    let setting = "", folder = "", operation = "upsert";
    if (fileNameArr.length > 2) {
      setting = fileNameArr[0];
      folder = fileNameArr[1];
      if (fileNameArr.length > 3) {
        operation = fileNameArr[2];
      }
    } else {
      setting = "candidate";
      folder = fileNameArr[0];
    }
    const file = (fileNameArr[fileNameArr.length - 1].split(".")[0]).substr(0, 20),
      stateMachineParams = {
        stateMachineArn: process.env.STATENACHINE,
        input: JSON.stringify({ bucketName, fileName, operation, setting, folder }),
        name: `${setting}_${folder}_${file}_${Date.now()}`
      }, execution = await stepFunctions.startExecution(stateMachineParams).promise();
    event = { ...event, execution };
  }
  return event;
};
