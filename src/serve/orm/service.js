import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { cwd, env } from 'process';

class OrmService {
    constructor() {
        this._location = join(cwd(), 'cropper.db');
        this._migrations = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
        this._debug = !!env.DEBUG;

        this._lastPromise = Promise.resolve();
        process.on('exit', this._closeDatabase.bind(this));
    }

    async get(...args) {
        this._prepareStatement(args);
        return this._executeWithDb(db => db.get.apply(db, args));
    }

    async exec(...args) {
        this._prepareStatement(args);
        return this._executeWithDb(db => db.exec.apply(db, args));
    }

    async all(...args) {
        this._prepareStatement(args);
        return this._executeWithDb(db => db.all.apply(db, args));
    }

    async run(...args) {
        this._prepareStatement(args);
        return this._executeWithDb(db => db.run.apply(db, args));
    }

    async prepare(...args) {
        this._prepareStatement(args);
        return this._executeWithDb(db => db.prepare.apply(db, args));
    }

    _executeWithDb(callback) {
        const lastPromise = this._lastPromise;
        let newPromiseResolve = null;
        this._lastPromise = new Promise(resolve => newPromiseResolve = resolve);
        const execute = async() => {
            try {
                await lastPromise;
                const db = await this._getDatabase();
                return await callback(db);
            }
            finally {
                newPromiseResolve();
            }
        };
        return execute();
    }

    _prepareStatement(args) {
        if (!args[1]) {
            return;
        }

        let statement = args[0];
        let params = args[1];
        if (!Array.isArray(params)) {
            const inParams = Object.keys(params).filter(param => Array.isArray(params[param]));
            for (let i = 0; i < inParams.length; i++) {
                const param = inParams[i];
                const replaceParam = [];
                for (let j = 0; j < params[param].length; j++) {
                    const newParam = param + j;
                    const newParamValue = params[param][j];
                    params[newParam] = newParamValue;
                    replaceParam.push(newParam);
                }
                statement = statement.split(param)
                                     .join(replaceParam.join(', '));
                delete params[inParams[i]];
            }
        }

        for (let key of Object.keys(params)) {
            if (typeof(params[key]) === 'object' && params[key] !== null) {
                params[key] = params[key].toString();
            }
        }

        args[0] = statement;
        args[1] = params;
    }

    async _getDatabase() {
        if (!this._db) {
            if (this._debug) {
                sqlite3.verbose();
            }

            this._db = await open({
                filename: this._location,
                driver: sqlite3.cached.Database
            });

            await this._db.get('PRAGMA foreign_keys = ON');

            await this._db.migrate({
                migrationsPath: this._migrations
            });
        }
        return this._db;
    }

    _closeDatabase() {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
    }
}

export default new OrmService();
