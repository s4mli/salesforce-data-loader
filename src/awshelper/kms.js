'use strict';
const AWS = require('aws-sdk');

module.exports = ({ region }) => ({
    encrypt: async (text, keyArn) => {
        const kms = new AWS.KMS({
            region: region
        }), output = await kms.encrypt({
            Plaintext: text,
            KeyId: keyArn
        }).promise();
        return output.CiphertextBlob.toString('base64');
    },

    decrypt: async (encrypted) => {
        const kms = new AWS.KMS({
            region: region
        }), output = await kms.decrypt({
            CiphertextBlob: Buffer.from(encrypted, 'base64')
        }).promise();
        return output.Plaintext.toString('utf8');
    },
});
