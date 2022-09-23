import ChildProcess from './utils/spawn.js';

export const InputFfmpegTemplate = '<input_file>';
export const OutputFfmpegTemplate = '<output_file>';
export const CropXFfmpegTemplate = '<x>';
export const CropYFfmpegTemplate = '<y>';
export const CropXOFfmpegTemplate = '<xo>';
export const CropYOFfmpegTemplate = '<yo>';
export const DefaultFfmpegCropTemplate = `-y -i ${InputFfmpegTemplate} -map_metadata 0 -map 0 -crf 17 -vf crop=${CropXFfmpegTemplate}:${CropYFfmpegTemplate}:${CropXOFfmpegTemplate}:${CropYOFfmpegTemplate} -c:a copy -c:s copy ${OutputFfmpegTemplate}`;

class VideoCropper {
    async cropFile(inputFile, outputFile, crop, fileX, fileY, metadata, ffmpegPath, ffmpegOptions) {
        if (metadata) {
            const codec = await this._detectCodecName(inputFile, ffmpegPath);
            if (codec !== 'h264' && codec !== 'hevc') {
                throw new Error(`Metadata based crop not available for ${codec}`);
            }
            await this._metadata_crop(inputFile, outputFile, crop, fileX, fileY, codec, ffmpegPath);
        }
        else {
            this._encode_crop(ffmpegOptions, inputFile, outputFile, crop, ffmpegPath);
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

    async _encode_crop(template, inputFile, outputFile, crop, ffmpegPath) {
        const ffmpegOptions = await this._parseCropTemplate(template, inputFile, outputFile, crop);
        const childProcess = new ChildProcess('ffmpeg',
            ffmpegOptions,
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

    _onConsoleOutput(dataStr) {
        console.error('ffmpeg: ' + dataStr);
    }

    _parseCropTemplate(template, inputFile, outputFile, crop) {
        const [x, y, xOffset, yOffset] = crop;
        const options = template.split(' ');
        for (let i = 0; i < options.length; i++) {
            switch (options[i]) {
                case InputFfmpegTemplate:
                    options[i] = inputFile;
                    break;
                case OutputFfmpegTemplate:
                    options[i] = outputFile;
                    break;
                case CropXFfmpegTemplate:
                    options[i] = x;
                    break;
                case CropYFfmpegTemplate:
                    options[i] = y;
                    break;
                case CropXOFfmpegTemplate:
                    options[i] = xOffset;
                    break;
                case CropYOFfmpegTemplate:
                    options[i] = yOffset;
                    break;
                default:
                    options[i] = options[i]
                        .replaceAll(CropXFfmpegTemplate, x)
                        .replaceAll(CropYFfmpegTemplate, y)
                        .replaceAll(CropXOFfmpegTemplate, xOffset)
                        .replaceAll(CropYOFfmpegTemplate, yOffset);
                    break;
            }
        }
        return options;
    }
}

const instance = new VideoCropper();
export default instance.cropFile.bind(instance);
