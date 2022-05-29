import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { program } from 'commander';
import detect_dimensions from './detect-dimensions.js';

const fileExists = async(file) => {
    try {
        return !!(await stat(file));
    }
    catch(e) {
        return false;
    }
};

const detect = async(file) => {
    try {
        const path = resolve(file);
        if (!fileExists(path)) {
            throw new Error('File does not exist');
        }
        const { x, y, xOffset, yOffset, aspect } = await detect_dimensions(path, program.opts().ffmpegRoot);
        console.error(`width:\t\t${x}\n` +
                      `height:\t\t${y}\n` +
                      `left_offset:\t${xOffset}\n` +
                      `top_offset:\t${yOffset}\n` +
                      `aspect:\t\t${aspect}`);
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

program.name('cropper')
    .description('Detects true size and crops videos using ffmpeg')
    .version('1.0.0')
    .option('-f, --ffmpeg-root <path>', 'path to ffmpeg');

program.command('detect')
    .description('Detects the true dimensions of a video')
    .argument('<file>', 'video file to detect dimensions of')
    .action(detect);

program.command('crop')
    .description('Crop a file using ffmpeg')
    .argument('<file>', 'video file to detect dimensions of');

await program.parse();
