'use strict';
const AWS = require('aws-sdk');

module.exports = ({ region, secretId }) => ({
    get: async () => {
        const sm = new AWS.SecretsManager({ region: region }),
            got = await sm.getSecretValue({ SecretId: secretId }).promise();
        return "SecretString" in got ? JSON.parse(got.SecretString) : null;
    },
    update: async (secret) => {
        const sm = new AWS.SecretsManager({ region: region });
        return await sm.updateSecret({
            SecretId: secretId,
            SecretString: JSON.stringify(secret)
        }).promise();
    },
    put: async (secret) => {
        const sm = new AWS.SecretsManager({ region: region });
        return await sm.putSecretValue({
            SecretId: secretId,
            SecretString: JSON.stringify(secret)
        }).promise();
    }
});
