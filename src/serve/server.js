import express, { json as ejson } from 'express';
import { promisify } from 'util';
import { join } from 'path';
import Queue from './queue.js';

class Server {
    static port = 4200;

    constructor(options, detect, cropFile) {
        this.app = express();
        this.app.use(ejson())
        this.app.get('/api/1/queue', this.listQueue.bind(this));
        this.app.post('/api/1/queue/add', this.addToQueue.bind(this));
        this.app.post('/api/1/webhook/sonarr', this.arrWebhook.bind(this));
        this.app.post('/api/1/webhook/radarr', this.arrWebhook.bind(this));

        this.queue = new Queue(options, detect, cropFile);
    }

    async serve() {
        const listen = promisify(this.app.listen.bind(this.app));
        const instance = listen(Server.port);
        console.info(`Listening on port ${Server.port}`);
        await instance;
    }

    async listQueue(req, res) {
        res.json({
            success: true,
            detail: {
                type: 'queue',
                subtype: 'list',
                items: this.queue.getQueueItems()
            }
        })
    }

    async addToQueue(req, res) {
        if (!req.body || !req.body.file) {
            res.json({
                success: false,
                detail: {
                    type: 'queue/add',
                    error: 'No file was provided in message body'
                }
            });
            return;
        }
        const addedPosition = this.queue.addToQueue(req.body.file);
        res.json({
            success: true,
            detail: {
                type: 'queue/add',
                position: addedPosition
            }
        });
    }

    getProgramName(event) {
        return event.episodes ? 'Sonarr' : 'Radarr';
    }

    async arrWebhook(req, res) {
        const event = req.body;
        switch (event.eventType) {
            case 'Download':
                const isSonarr = event.series && event.series.path && event.episodeFile && event.episodeFile.relativePath;
                const isRadarr = event.movie && event.movie.folderPath && event.movieFile && event.movieFile.relativePath;
                if (!isSonarr && !isRadarr) {
                    console.warn('Request received for downloadFolderImported without an importedPath:\n' + JSON.stringify(event, null, 4));
                    res.json({
                        success: false,
                        detail: {
                            type: 'webhook/arr/add',
                            error: 'No file path provided in event'
                        }
                    });
                    return;
                }
                const addPath = isSonarr
                    ? join(event.series.path, event.episodeFile.relativePath)
                    : join(event.movie.folderPath, event.movieFile.relativePath);
                const addedPosition = this.queue.addToQueue(addPath);
                res.json({
                    success: true,
                    detail: {
                        type: 'webhook/arr/add',
                        position: addedPosition
                    }
                });
                break;
            case 'MovieFileDelete':
            case 'EpisodeFileDelete':
                const isSonarrDelete = event.episodeFile && event.episodeFile.path;
                const isRadarrDelete = event.movieFile && event.movieFile.path;
                if (!isSonarrDelete && !isRadarrDelete) {
                    console.warn('Request received for EpisodeFileDelete without a path:\n' + JSON.stringify(event, null, 4));
                    res.json({
                        success: false,
                        detail: {
                            type: 'webhook/arr/remove',
                            error: 'No file path provided in event'
                        }
                    });
                    return;
                }
                const deletePath = isSonarrDelete
                    ? event.episodeFile.path
                    : event.movieFile.path;
                const episodeDeletedPosition = this.queue.removeFromQueue(deletePath);
                res.json({
                    success: true,
                    detail: {
                        type: 'webhook/arr/remove',
                        position: episodeDeletedPosition
                    }
                });
                break;
            case 'Test':
                this.handleTestArrEvent(req, res);
                break;
            default:
                this.handleIrrelevantArrEvent(req, res);
                break;
        }
    }

    handleTestArrEvent(req, res) {
        const program = this.getProgramName(req.body);
        console.info(`${program} performed a test.`);
        res.json({
            success: true,
            detail: {
                type: 'test',
                program
            }
        });
    }

    handleIrrelevantArrEvent(req, res) {
        const program = this.getProgramName(req.body);
        const warning = `Non-relevant ${program} event received: ${req.body.eventType}. Update your ${program} settings to remove this warning.`;
        console.warn(warning);
        console.warn('Event was:\n' + JSON.stringify(req.body, null, 4));
        res.json({
            success: false,
            detail: {
                type: 'event',
                subtype: req.body.eventType,
                error: warning
            }
        });
    }
}

export default async(...args) => {
    const serverInstance = new Server(...args);
    return await serverInstance.serve();
};
