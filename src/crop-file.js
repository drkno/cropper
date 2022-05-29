import ChildProcess from './utils/spawn.js';

class VideoCropper {
    async cropFile(inputFile, outputFile, crop, fileX, fileY, ffmpegPath = '') {
        const codec = await this._detectCodecName(inputFile, ffmpegPath);
        if (codec === 'h264' || codec === 'hevc') {
            await this._metadata_crop(inputFile, outputFile, crop, fileX, fileY, codec, ffmpegPath);
        }
        else {
            throw new Error('Cropping unavailable for provided codec');
        }
    }

    async _detectCodecName(inputFile, ffmpegPath) {
        const childProcess = new ChildProcess('ffprobe',
            ['-hide_banner', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputFile],
            {},
            ffmpegPath
        );
        const stdOut = await childProcess.getStdOut();
        return JSON.parse(stdOut)
            .streams
            .filter(v => v.codec_type === 'video')
            .map(v => v.codec_name)[0];
    }

    async _metadata_crop(inputFile, outputFile, crop, fileX, fileY, codec, ffmpegPath) {
        const [x, y, xOffset, yOffset] = crop;
        const left = xOffset;
        const right = fileX - x - xOffset;
        const top = yOffset;
        const bottom = fileY - y - yOffset;

        const childProcess = new ChildProcess('ffmpeg',
            ['-i', inputFile, '-codec', 'copy', '-bsf:v', `${codec}_metadata=crop_left=${left}:crop_right=${right}:crop_top=${top}:crop_bottom=${bottom}`, outputFile],
            {
                // the following avoids a memory leak
                disableStdPipeAppend: true
            },
            ffmpegPath
        );
        childProcess.on('stdout', this._onConsoleOutput);
        childProcess.on('stderr', this._onConsoleOutput);
        await childProcess.getAwaitablePromise();
    }

    // async premain(collector) {
    //     collector.appendFfmpegOptions([
    //         '-filter:v', `crop=${x}:${y}:${xOffset}:${yOffset}`
    //     ]);
    // }

    _onConsoleOutput(dataStr) {
        console.info('ffmpeg: ' + dataStr);
    }
}

const instance = new VideoCropper();
export default instance.cropFile.bind(instance);
