'use strict';
const AWS = require('aws-sdk');
const sts = require('./sts');
const { Client } = require('pg');

class RedshiftClient {
    constructor({ host, port, database, user, password }) {
        let config = {
            ssl: true,
            host: host,
            port: parseInt(port),
            database: database,
            user: user,
            password: password
        };
        this.client = new Client(config, { rawConnection: true });
    }

    async connect() {
        if (!this.client) {
            throw new Error("establish a connection first");
        } else {
            await this.client.connect();
        }
    }

    async query(sql) {
        if (!this.client) {
            throw new Error("establish a connection first");
        } else {
            let data = await this.client.query(sql);
            return data.rows;
        }
    }

    async end() {
        if (this.client) {
            await this.client.end();
        }
    }
};

const clusterCredentialsFrom = async ({ region, roleArn, user, database, identifier }) => {
    const rawClient = async () => {
        let tempCredentials = await sts({ region: region }).assume({ roleArn });
        return new AWS.Redshift({ ...tempCredentials, ...{ region: region } });
    };
    let rc = await rawClient();
    return await rc.getClusterCredentials({
        DbUser: user,
        DbName: database,
        ClusterIdentifier: identifier,
        DurationSeconds: 900,
    }).promise();
}

let singleton = {};
Object.defineProperty(singleton, "instance", {
    get: () => {
        const redshiftClientSymbol = Symbol.for("_RedshiftClient_Singleton_");
        return global[redshiftClientSymbol];
    },
    set: (client) => {
        const redshiftClientSymbol = Symbol.for("_RedshiftClient_Singleton_");
        if (Object.getOwnPropertySymbols(global).indexOf(redshiftClientSymbol) <= -1) {
            global[redshiftClientSymbol] = client;
        } else {
            throw new Error(">>> set is not gonna work for a singletion <<<");
        }
    }
});
Object.freeze(singleton);

const getInstance = async ({ region, host, port, identifier, database, user, password, roleArn = null }) => {
    try {
        if (!singleton.instance) {
            if (roleArn) {
                let tempPass = await clusterCredentialsFrom({ region, roleArn, user, database, identifier });
                user = tempPass.DbUser, password = tempPass.DbPassword;
            }
            console.log(`>>> create redshift instance <<<`);
            singleton.instance = new RedshiftClient({ host, port, database, user, password });;
            console.log(`>>> establish redshift connection <<<`);
            await singleton.instance.connect();
        }
        return singleton.instance;
    } catch (err) {
        singleton = {};
        throw err;
    }
};

module.exports = ({ region, host, port, identifier, database, user, password, roleArn = null }) => ({
    query: async (sql) => {
        let client = await getInstance({ region, host, port, identifier, database, user, password, roleArn });
        return await client.query(sql);
    },
    end: async () => {
        try {
            if (singleton.instance) {
                console.log(`>>> terminate redshift connection <<<`);
                await singleton.instance.end();
            }
        } catch (err) {
            throw err;
        } finally {
            singleton = {};
        }
    },
    fetchClusterCredentials: clusterCredentialsFrom,
    RedshiftClient: RedshiftClient
});
