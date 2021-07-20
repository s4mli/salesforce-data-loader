const u = require("awshelper/util");
const write = require("./write-record");
const discrepancyFor = (sourceObj, targetObj) => {
    const sourceKeys = Object.keys(sourceObj),
        targetKeys = Object.keys(targetObj),
        keysInBoth = sourceKeys.filter(x => targetKeys.includes(x)),
        keysOnlyInSource = sourceKeys.filter(x => !targetKeys.includes(x)),
        isValidValue = (k) => { return k !== "" && k !== undefined && k !== null; },
        isEqual = (s, t) => {
            if (u.isNumeric(s) && u.isNumeric(t)) {
                return parseFloat(s) == parseFloat(t);
            } else {
                return s.toString().trim().toLowerCase() == t.toString().trim().toLowerCase();
            }
        };
    let discrepancy = {}, diff = {}, onlyInSource = {};
    for (let k of keysInBoth) {
        if (isValidValue(sourceObj[k]) && isValidValue(targetObj[k]) &&
            !u.isDate(sourceObj[k]) && !u.isDate(targetObj[k]) &&
            !isEqual(sourceObj[k], targetObj[k])) {
            diff[k] = { source: sourceObj[k], target: targetObj[k] };
        }
    }
    for (let k of keysOnlyInSource) { onlyInSource[k] = sourceObj[k]; }
    if (Object.keys(diff).length) { discrepancy.diff = diff; }
    if (Object.keys(onlyInSource).length) { discrepancy.miss = onlyInSource; }
    return discrepancy;
};

exports.handler = async (event) => {
    await write(event, event.batch, process.env.REGION,
        process.env.TABLE, (sourceItem, item) => {
            const sfId = item["sf__Id"], discrepancy = discrepancyFor(sourceItem, item);
            return {
                needed: false,
                // needed: Object.keys(discrepancy).length > 0,
                needed: false,
                SF_Id: sfId,
                Target_Record: JSON.stringify(item),
                Discrepancy: JSON.stringify(discrepancy)
            };
        }
    );
};
