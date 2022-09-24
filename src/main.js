import { program, InvalidArgumentError } from 'commander';
import { tmpNameSync } from 'tmp';
import { resolve, extname } from 'node:path';
import { unlink, rename } from 'node:fs/promises';
import fileExists from './utils/fileExists.js';
import crop_file, { DefaultFfmpegCropTemplate } from './crop-file.js';
import detect_dimensions from './detect-dimensions.js';
import server from './serve/server.js';

const withCommonErrorHandlingAndParsing = method => {
    return async(...args) => {
        try {
            const options = Object.assign(
                {},
                program.opts(),
                args[args.length - 2]
            );
            await method(...args.slice(0, args.length - 2), options);
        }
        catch(e) {
            if (e.code === 'ENOENT') {
                console.error('Unable to find "ffmpeg" and "ffprobe" binaries. Did you try adding --ffmpeg-root?');
            }
            else {
                console.error(e.message);
            }
        }
    };
};

const cropFile = async(inputFile, outputFile, { ffmpegRoot, crop, metadata, ffmpegOptions }) => {
    const { x, y, xOffset, yOffset, fileX, fileY } = await detect_dimensions(inputFile, ffmpegRoot);
    if (!crop || crop === 'auto') {
        crop = [x, y, xOffset, yOffset];
    }
    if (crop[0] === fileX && crop[1] === fileY) {
        throw new Error('Output file dimensions already match, file does not need cropping');
    }

    let inPlace = false;
    if (outputFile === 'in-place') {
        inPlace = true;
        outputFile = tmpNameSync({
            postfix: extname(inputFile)
        });
    }
    await crop_file(inputFile, outputFile, crop, fileX, fileY, metadata, ffmpegRoot, ffmpegOptions);
    if (inPlace) {
        await unlink(inputFile);
        await rename(outputFile, inputFile);
    }
};

const detect = async(file, { ffmpegRoot, json }) => {
    const { x, y, xOffset, yOffset, aspect, fileX, fileY } = await detect_dimensions(file, ffmpegRoot);
    if (json) {
        console.info(JSON.stringify({
            file_width: fileX,
            file_height: fileY,
            actual_width: x,
            actual_height: y,
            left_offset: xOffset,
            top_offset: yOffset,
            aspect
        }, null, 4));
    } else {
        console.info(`file_width:\t${fileX}\n` +
            `file_height:\t${fileY}\n` +
            `actual_width:\t${x}\n` +
            `actual_height:\t${y}\n` +
            `left_offset:\t${xOffset}\n` +
            `top_offset:\t${yOffset}\n` +
            `aspect:\t\t${aspect}`);
    }
};

const serve = async(options) => server(options, detect, cropFile);

const parseFilePath = value => {
    const inputPath = resolve(value);
    if (!fileExists(inputPath)) {
        throw new InvalidArgumentError(`File "${value}" does not exist.`);
    }
    return inputPath;
};

const parseCrop = value => {
    if (value === 'auto') {
        return value;
    }
    if (!/^[0-9]+:[0-9]+:[0-9]+:[0-9]+$/.test(value)) {
        throw new InvalidArgumentError(`Crop must follow the format "width:height:left_offset:top_offset" where each value is in px`);
    }
    return value.split(':').map(i => parseInt(i));
};

program.name('cropper')
    .description('Detects true size and crops videos using ffmpeg')
    .version('1.0.0')
    .option('-f, --ffmpeg-root <path>', 'path to ffmpeg', parseFilePath)
    .option('-j, --json', 'output as json');

program.command('detect')
    .description('Detects the true dimensions of a video')
    .argument('<file>', 'video file to detect dimensions of', parseFilePath)
    .action(withCommonErrorHandlingAndParsing(detect));

program.command('crop')
    .description('Crop a file using ffmpeg')
    .argument('<file>', 'video file to remove black borders from', parseFilePath)
    .argument('<output>', 'output file to save the cropped version as, or "in-place" to replace the existing file.', value => resolve(value))
    .option('-c, --crop <crop>', 'crop to use in the format "width:height:left_offset:top_offset" (px). A special value of "auto" is also accepted.', parseCrop, 'auto')
    .option('-t, --ffmpeg-options <options>', 'options string to use when cropping', value => value, DefaultFfmpegCropTemplate)
    .option('-m, --metadata', 'crop using metadata instead of re-encoding (h264 and hevc only). This option has inconsistent results in different players.')
    .action(withCommonErrorHandlingAndParsing(cropFile));

program.command('serve')
    .description('Start a server to receive events from Sonarr and Radarr')
    .option('-p, --paths <paths>', 'path mappings in the format "request_path:cropper_path,request_path2:cropper_path2"', value => value, '')
    .option('-t, --ffmpeg-options <options>', 'options string to use when cropping', value => value, DefaultFfmpegCropTemplate)
    .option('-m, --metadata', 'crop using metadata instead of re-encoding (h264 and hevc only). This option has inconsistent results in different players.')
    .action(withCommonErrorHandlingAndParsing(serve));

await program.parse();
