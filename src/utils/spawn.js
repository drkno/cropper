import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, resolve as pathResolve } from 'node:path';
import EventEmitter from './EventEmitter.js';

class ChildProcess extends EventEmitter {
    constructor(command, args = [], options = {}, ...extendedPath) {
        super();

        this._disableStdPipeAppend = options.disableStdPipeAppend || false;
        delete options.disableStdPipeAppend;

        this._onStdOut = this._onStdOut.bind(this);
        this._onStdErr = this._onStdErr.bind(this);
        this._onError = this._onError.bind(this);
        this._onClose = this._onClose.bind(this);
        const resolvedExtendedPath = extendedPath
            .map(p => pathResolve(p))
            .flatMap(p => existsSync(p) ? [p] : [])
            .reduce((paths, p) => {
                paths.push(p);
                const binPath = pathResolve(p, 'bin');
                if (existsSync(binPath)) {
                    paths.push(binPath);
                }
                return paths;
            }, []);

        this._process = this._spawn(command, args, Object.assign({
            stdio: ['pipe', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, {
                PATH: process.env.PATH + delimiter + resolvedExtendedPath.join(delimiter)
            })
        }, options));

        this._stdout = '';
        this._stderr = '';
        this._code = -1;

        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    async getStdOut() {
        await this._promise;
        return this._stdout;
    }

    async getStdErr() {
        await this._promise;
        return this._stderr;
    }

    async getExitCode() {
        await this._promise;
        return this._code;
    }

    getAwaitablePromise() {
        return this._promise;
    }

    kill(signal) {
        return this._process.kill(signal);
    }

    async abort() {
        this._onClose(-2);
        this.kill(9);
    }

    _spawn(command, args, options) {
        const cmd = spawn(command, args, options);
        cmd.stdout.on('data', this._onStdOut);
        cmd.stderr.on('data', this._onStdErr);
        cmd.on('error', this._onError);
        cmd.on('close', this._onClose);
        return cmd;
    }

    _onStdOut(data) {
        const dataStr = data.toString('utf-8');
        this.emit('stdout', this, dataStr);
        if (!this._disableStdPipeAppend) {
            this._stdout += dataStr;
        }
    }

    _onStdErr(data) {
        const dataStr = data.toString('utf-8');
        this.emit('stderr', this, dataStr);
        if (!this._disableStdPipeAppend) {
            this._stderr += dataStr;
        }
    }

    _onClose(code) {
        if (this._code === -1) {
            this._code = code;
            const result = {
                code: this._code,
                stdout: this._stdout,
                stderr: this._stderr
            };
            if (code >= 0) {
                this._resolve(result);
                this.emit('close', result);
            }
            else {
                this._onError(result);
            }
            this.removeAllListeners();
        }
    }

    _onError(err) {
        this.emit('err', err);
        this._reject(err);
    }
}

export default ChildProcess;
