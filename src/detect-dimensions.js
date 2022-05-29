import ChildProcess from './utils/spawn.js';

const KnownRatios = {
    '4:3 (sdtv)':           4/3,
    '16:9 (hdtv)':          16/9,
    '16:10 (golden ratio)': 16/10,
    '1.85:1 (cinema)':      1.85,
    '2.21:1 (widescreen)':  2.21,
    '2.35:1 (anamorphic)':  2.35,
    '2.39:1 (anamorphic)':  2.39,
    '5:3':                  5/3,
    '5:4':                  5/4,
    '1:1 (square)':         1
};

class DimensionsDetector {
    async detect_dimensions(file, ffmpegPath = '') {
        const dim = await this._detectCrop(file, ffmpegPath);
        if (dim.x === 0 || dim.y === 0) {
            throw new Error('Could not detect dimensions');
        }
        if (!this._checkValidityAndSetAspect(dim)) {
            throw new Error('Cannot calculate dimensions, calculated ended up with an unexpected ratio.');
        }
        return dim;
    }

    _pad(num) {
        return num.toString().padStart(2, '0');
    }

    _toTime(duration) {
        const date = new Date(duration * 1000);
        return `${date.getUTCHours()}:${this._pad(date.getUTCMinutes())}:${this._pad(date.getSeconds())}`;
    }

    async _probe(file, fromTime, ffmpegPath) {
        const childProcess = new ChildProcess('ffmpeg',
            ['-hide_banner', '-ss', fromTime, '-i', file, '-to', '00:00:05', '-vf', 'cropdetect', '-f', 'null', '-'],
            {},
            ffmpegPath
        );
        return await childProcess.getStdErr();
    }

    async _getDuration(file, ffmpegPath) {
        const childProcess = new ChildProcess('ffprobe',
            ['-hide_banner', '-print_format', 'json', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
            {},
            ffmpegPath
        );
        return await childProcess.getStdOut();
    }

    async _detectCrop(file, ffmpegPath) {
        const duration = await this._getDuration(file,ffmpegPath);
        const tenth = duration / 10;
        const probePoints = [
            tenth,
            tenth * 5,
            tenth * 9
        ];

        const cropDimensions = (await Promise.all(probePoints.map(point => this._probe(file, this._toTime(point), ffmpegPath))))
            .map(output => output.split('\n')
                .map(line => line.trim())
                .filter(line => line.indexOf(' crop=') >= 0)
                .map(line => line.split(' ').slice(-1)[0])
                .map(line => line.split('=')[1])
                .map(line => line.split(':')))
            .reduce((acc, curr) => acc.concat(curr), [])
            .reduce((acc, curr) => {
                const [x, y, xOffset, yOffset] = curr;

                acc.x[x] = (acc.x[x] || 0) + 1;
                acc.y[y] = (acc.y[y] || 0) + 1;
                acc.xOffset[xOffset] = (acc.xOffset[xOffset] || 0) + 1;
                acc.yOffset[yOffset] = (acc.yOffset[yOffset] || 0) + 1;

                return acc;
            }, {
                x: {},
                y: {},
                xOffset: {},
                yOffset: {}
            });
        return {
            x: this._getMostCommon(cropDimensions.x),
            y: this._getMostCommon(cropDimensions.y),
            xOffset: this._getMostCommon(cropDimensions.xOffset),
            yOffset: this._getMostCommon(cropDimensions.yOffset)
        };
    }

    _getMostCommon(dimension) {
        return Object.entries(dimension).reduce((acc, curr) => {
            if (curr[1] > acc[1] || (curr[1] === acc[1] && curr[0] > acc[0])) {
                return curr;
            }
            return acc;
        }, ['0', 0])[0];
    }

    _checkValidityAndSetAspect(dimension) {
        const ratio = dimension.x / dimension.y;
        for (let known in KnownRatios) {
            if (Math.abs(KnownRatios[known] - ratio) < 0.1) {
                dimension.aspect = known;
                return true;
            }
        }
        return false;
    }
}

const instance = new DimensionsDetector();

export default instance.detect_dimensions.bind(instance);
