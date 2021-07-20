'use strict';
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

let cachedPrivateKey = {};
module.exports = ({ region, issuer }) => ({
    auth: async (audience) => {
        let { kid, pem } = await (async () => {
            if (!cachedPrivateKey || !cachedPrivateKey.privateKey || cachedPrivateKey.expires <= Date.now()) {
                let sm = new AWS.SecretsManager({ region: region });
                let pk = await sm.getSecretValue({
                    SecretId: `seek/s2sauth/${issuer}`
                }).promise();
                cachedPrivateKey = {
                    privateKey: JSON.parse(pk.SecretString),
                    expires: Date.now() + 45 * 60 * 1000
                };
            }
            return cachedPrivateKey.privateKey;
        })();

        let token = jwt.sign({}, pem, {
            algorithm: 'RS256',
            expiresIn: '1h',
            audience: audience,
            issuer: kid.slice(0, -17),// issuer
            keyid: kid
        });
        return { authorization: `Bearer ${token}` };
    }
});
