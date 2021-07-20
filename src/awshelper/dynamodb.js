'use strict';
const util = require('./util');
const dynamodb = require('aws-sdk/clients/dynamodb');

class DynamoDBClient {
    constructor(region, tableName) {
        this.tableName = tableName;
        this.client = new dynamodb.DocumentClient({ region: region });
    }

    eatConditionalCheckedFailedException(err) {
        if (err.code !== 'ConditionalCheckFailedException') {
            throw err;
        }
    }

    async select(key) {
        try {
            return await this.client.get({
                TableName: this.tableName,
                Key: key
            }).promise();
        } catch (err) {
            throw err;
        }
    }

    async create(item) {
        try {
            return await this.client.put({
                TableName: this.tableName,
                Item: item
            }).promise();
        } catch (err) {
            throw err;
        }
    }

    async update(key, updateExpression, conditionExpression, expressionAttributeValues) {
        try {
            let params = {
                TableName: this.tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ReturnValues: "ALL_NEW"
            };
            if (conditionExpression) {
                params.ConditionExpression = conditionExpression;
            }
            if (expressionAttributeValues) {
                params.ExpressionAttributeValues = expressionAttributeValues;
            }
            return await this.client.update(params).promise();
        } catch (err) {
            this.eatConditionalCheckedFailedException(err);
        }
    }

    async delete(key, conditionExpression, expressionAttributeValues) {
        try {
            let params = {
                TableName: this.tableName,
                Key: key
            };
            if (conditionExpression) {
                params.ConditionExpression = conditionExpression;
                if (expressionAttributeValues) {
                    params.ExpressionAttributeValues = expressionAttributeValues;
                }
            }
            return await this.client.delete(params).promise();
        } catch (err) {
            this.eatConditionalCheckedFailedException(err);
        }
    }

    async query(keyExpression, filterExpression, expressionAttributeValues) {
        try {
            let params = {
                TableName: this.tableName,
                KeyConditionExpression: keyExpression,
                ExpressionAttributeValues: expressionAttributeValues
            };
            if (filterExpression) {
                params.FilterExpression = filterExpression;
            }
            return await this.client.query(params).promise();
        } catch (err) {
            this.eatConditionalCheckedFailedException(err);
        }
    }

    async queryByIndex(indexName, keyExpression, filterExpression, expressionAttributeValues) {
        try {
            let params = {
                TableName: this.tableName,
                IndexName: indexName,
                KeyConditionExpression: keyExpression,
                ExpressionAttributeValues: expressionAttributeValues
            };
            if (filterExpression) {
                params.FilterExpression = filterExpression;
            }
            return await this.client.query(params).promise();
        } catch (err) {
            this.eatConditionalCheckedFailedException(err);
        }
    }
};

const expressionFieldsAndValuesFrom = (kvParams = {}) => {
    return {
        fields: Object.keys(kvParams).reduce((expressionFields, key) => {
            let expression = `${key}=:${key}`;
            if (expressionFields.includes(expression)) {
            } else {
                expressionFields.push(expression);
            }
            return expressionFields;
        }, []),
        values: Object.keys(kvParams).reduce((values, key) => {
            if (key in values) {
            } else {
                values[`:${key}`] = kvParams[key];
            }
            return values;
        }, {})
    };
}

const keyExists = (item, ...keyFields) => {
    return keyFields.reduce((exists, k) => {
        exists &= ((k in item) ? true : false);
        return exists;
    }, true);
}

module.exports = ({ region, tableName }, ...keyFields) => ({
    client: new DynamoDBClient(region, tableName),

    save: async (item) => {
        if (!keyExists(item, ...keyFields)) {
            throw new Error(`Missing some of the keys ${keyFields} `)
        } else {
            return await module.exports({
                region: region,
                tableName: tableName
            }, ...keyFields).client.create(
                util.compact(item)
            );
        }
    },
    read: async (params) => {
        if (!keyExists(params, ...keyFields)) {
            throw new Error(`Missing some of the keys ${keyFields} `)
        } else {
            let item = await module.exports({
                region: region,
                tableName: tableName
            }, ...keyFields).client.select(
                util.compact(
                    util.pick(params, ...keyFields)
                )
            );
            return item.Item;
        }
    },
    delete: async (params) => {
        if (!keyExists(params, ...keyFields)) {
            throw new Error(`Missing some of the keys ${keyFields} `)
        } else {
            let condition = util.drop(params, ...keyFields),
                conditionExpression = null,
                expressionAttributeValues = null;
            if (condition) {
                let { fields, values } = expressionFieldsAndValuesFrom(condition);
                conditionExpression = fields.length > 0 ? fields.join(" AND ") : null;
                expressionAttributeValues = values;
            }
            return await module.exports({
                region: region,
                tableName: tableName
            }, ...keyFields).client.delete(
                util.compact(
                    util.pick(params, ...keyFields)
                ),
                conditionExpression,
                expressionAttributeValues
            );
        }
    },
    query: async (params) => {
        let filter = util.drop(params, ...keyFields);
        if (!filter) {
            let item = await module.exports({
                region: region,
                tableName: tableName
            }, ...keyFields).read(params);
            if (item) {
                return [item];
            } else {
                return [];
            }
        } else {
            if (!keyExists(params, ...keyFields)) {
                throw new Error(`Missing some of the keys ${keyFields} `)
            } else {
                let keyFieldsAndValues = expressionFieldsAndValuesFrom(util.pick(
                    params, ...keyFields)
                );
                let { fields, values } = expressionFieldsAndValuesFrom(filter);
                let item = await module.exports({
                    region: region,
                    tableName: tableName
                }, ...keyFields).client.query(
                    keyFieldsAndValues.fields.join(" AND "),
                    fields.length > 0 ? fields.join(" AND ") : "", {
                    ...values,
                    ...keyFieldsAndValues.values
                });
                return item.Items;
            }
        }
    },
    queryByIndex: async (params, indexName, ...indexFields) => {
        if (!keyExists(params, ...indexFields)) {
            throw new Error(`Missing some of the indexes ${indexFields} `)
        } else {
            let keyFieldsAndValues = expressionFieldsAndValuesFrom(util.pick(
                params, ...indexFields)
            );
            let filter = util.drop(params, ...indexFields),
                filterExpression = null,
                expressionAttributeValues = keyFieldsAndValues.values;
            if (filter) {
                let { fields, values } = expressionFieldsAndValuesFrom(filter);
                filterExpression = fields.length > 0 ? fields.join(" AND ") : null;
                expressionAttributeValues = { ...expressionAttributeValues, ...values };
            }

            let item = await module.exports({
                region: region,
                tableName: tableName
            }, ...keyFields).client.queryByIndex(indexName,
                keyFieldsAndValues.fields.join(" AND "),
                filterExpression,
                expressionAttributeValues
            );
            return item.Items;
        }
    },
    update: async (params, newItem) => {
        if (!keyExists(params, ...keyFields)) {
            throw new Error(`Missing some of the keys ${keyFields} `)
        } else {
            let item = util.drop(newItem, ...keyFields);
            if (!item) {
                throw new Error(`Missing update fields`)
            } else {
                let { fields, values } = expressionFieldsAndValuesFrom(item),
                    condition = util.drop(params, ...keyFields),
                    conditionExpression = null,
                    expressionAttributeValues = values;
                if (condition) {
                    let conditionFieldsAndValues = expressionFieldsAndValuesFrom(condition);
                    conditionExpression = conditionFieldsAndValues.fields.length > 0 ?
                        conditionFieldsAndValues.fields.join(" AND ") : null;
                    expressionAttributeValues = { ...expressionAttributeValues, ...conditionFieldsAndValues.values };
                }
                return await module.exports({
                    region: region,
                    tableName: tableName
                }, ...keyFields).client.update(
                    util.compact(
                        util.pick(params, ...keyFields)
                    ),
                    "SET " + fields.join(","),
                    conditionExpression,
                    expressionAttributeValues
                );
            }
        }
    },
});
