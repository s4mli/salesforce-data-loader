'use strict';
const crypto = require("crypto");
const s3Service = require('./s3');
const dnt = require("date-and-time");
const base64Img = require('base64-img');

module.exports = {
  isDate: (d) => {
    return [
      "YYYY-MM-DD...", "MM-DD-YYYY...", "DD-MM-YYYY...",
      "YYYY/MM/DD...", "MM/DD/YYYY...", "DD/MM/YYYY..."
    ].some(f => dnt.isValid(d, f));
  },
  isNumeric: (n) => !isNaN(parseFloat(n)) && isFinite(n),
  md5: (x) => crypto.createHash("md5").update(x, "utf8").digest("hex"),
  drop: (obj, ...fields) => {
    return Object.keys(obj).reduce((newObj, field) => {
      if (!fields.includes(field)) {
        newObj[field] = obj[field];
      }
      return newObj;
    }, {});
  },
  pick: (obj, ...fields) => {
    return fields.reduce((newObj, field) => {
      if (field in obj) {
        newObj[field] = obj[field];
      }
      return newObj;
    }, {});
  },
  compact: (object) => {
    const objectIsEmpty = (object) => {
      if (object !== null && object !== undefined) {
        for (let key in object) {
          if (object.hasOwnProperty(key)) {
            return false;
          }
        }
      }
      return true;
    };
    const compactArray = (arrayObject) => {
      return arrayObject.map(ele => {
        switch (typeof ele) {
          case "undefined": return null;
          case "string": return ele === "" || ele === "undefined" || ele === "null" ? null : ele;
          case "object":
            if (objectIsEmpty(ele)) {
              return null;
            } else {
              if (Array.isArray(ele)) {
                let compactedArray = compactArray(ele);
                return compactedArray.length > 0 ? compactedArray : null;
              } else {
                let compactedObject = module.exports.compact(ele);
                return objectIsEmpty(compactedObject) ? null : compactedObject;
              }
            }
          default: return ele;
        }
      }).filter(ele => ele != null);
    };
    const compactObject = (object) => {
      return Object.keys(object).reduce((newObj, field) => {
        let fieldType = typeof object[field],
          fieldValue = object[field];
        switch (fieldType) {
          case "undefined": break;
          case "object":
            if (!objectIsEmpty(fieldValue)) {
              if (Array.isArray(fieldValue)) {
                let compactedArray = compactArray(fieldValue);
                if (compactedArray.length > 0) {
                  newObj[field] = compactedArray;
                }
              } else {
                let compactedObject = module.exports.compact(fieldValue);
                if (!objectIsEmpty(compactedObject)) {
                  newObj[field] = compactedObject;
                }
              }
            } break;
          default:
            if (fieldType !== "undefined" && fieldValue !== "null" && fieldValue !== "") {
              newObj[field] = fieldValue;
            } break;
        }
        return newObj;
      }, {});
    };
    switch (typeof object) {
      case "undefined": return null;
      case "string": return object === "" || object === "undefined" || object === "null" ? null : object;
      case "object":
        if (objectIsEmpty(object)) {
          return null;
        } else {
          if (Array.isArray(object)) {
            let newArr = compactArray(object);
            return newArr.length > 0 ? newArr : null;
          } else {
            let newObj = compactObject(object);
            return objectIsEmpty(newObj) ? null : newObj;
          }
        }
      default: return object;
    }
  },
  dataFrom: (event, stripMetaDataTo = null) => {
    const stripMetaData = (data) => {
      return Object.keys(data).reduce((newData, key) => {
        // expect an object array, each object has name and value
        if ("metadata" === key.trim().toLowerCase()) {
          if (stripMetaDataTo) {
            newData[stripMetaDataTo] = {};
          }
          for (let d of data[key]) {
            let value = ((v) => {
              let r = v;
              try { r = JSON.parse(v); } catch (err) { } finally { return r; }
            })(d.value);
            if (stripMetaDataTo) {
              newData[stripMetaDataTo][d.name.trim()] = value;
            } else {
              newData[d.name.trim()] = value;
            }
          }
        } else {
          newData[key] = data[key];
        }
        return newData;
      }, {});
    };
    let body = event.Records ? JSON.parse(event.Records[0].body) : event;
    return stripMetaData((body.Message) ? JSON.parse(body.Message) : body, stripMetaDataTo);
  },
  // image / application
  attachment: async (filePathName, attachmentName, contentType = 'image') => {
    let filePathNameArr = filePathName.split("/");
    if (!attachmentName) {
      attachmentName = filePathNameArr[filePathNameArr.length - 1];
    }
    let fileType = attachmentName.substr(attachmentName.lastIndexOf(".") + 1),
      bodyBase64 = base64Img.base64Sync(filePathName).replace(`data:${contentType}/${fileType};base64,`, "");
    return {
      header: {
        'Content-ID': `<${attachmentName}>`,
        'Content-Disposition': `inline ;filename="${attachmentName}"`
      },
      contentType: `${contentType}/${fileType}`,
      contentTransferEncoding: 'base64',
      body: bodyBase64
    };
  },
  attachmentS3: async ({ bucketName, fileName }, attachmentName, contentType = 'image') => {
    let filePathNameArr = fileName.split("/");
    if (!attachmentName) {
      attachmentName = filePathNameArr[filePathNameArr.length - 1];
    }
    let fileType = attachmentName.substr(attachmentName.lastIndexOf(".") + 1),
      bodyBase64 = (await s3Service({ bucketName, fileName }).read({ bucketName, fileName })).toString("base64");
    return {
      header: {
        'Content-ID': `<${attachmentName}>`,
        'Content-Disposition': `inline ;filename="${attachmentName}"`
      },
      contentType: `${contentType}/${fileType}`,
      contentTransferEncoding: 'base64',
      body: bodyBase64
    };
  },
  waterfall: async (arg, ...fns) => {
    for (let fn of fns) {
      arg = await fn(arg);
    }
    return arg;
  },
  sleep: (waitTimeInMs) => {
    return new Promise(resolve => setTimeout(resolve, waitTimeInMs));
  },
};
