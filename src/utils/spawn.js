import { spawn } from 'node:child_process';
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
        this._process = this._spawn(command, args, Object.assign({
            stdio: ['pipe', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, {
                PATH: process.env.PATH + delimiter + extendedPath.map(p => pathResolve(p)).join(delimiter)
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
        this.emit('stdout', dataStr);
        if (!this._disableStdPipeAppend) {
            this._stdout += dataStr;
        }
    }

    _onStdErr(data) {
        const dataStr = data.toString('utf-8');
        this.emit('stderr', dataStr);
        if (!this._disableStdPipeAppend) {
            this._stderr += dataStr;
        }
    }

    _onClose(code) {
        this._code = code;
        const result = {
            code: this._code,
            stdout: this._stdout,
            stderr: this._stderr
        };
        this._resolve(result);
        this.emit('close', result);
        this.removeAllListeners();
    }

    _onError(err) {
        this.emit('err', err);
        this._reject(err);
    }
}

export default ChildProcess;
