import express, { json as ejson } from 'express';
import { promisify } from 'util';
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
        switch (req.body.eventType) {
            case 'downloadFolderImported':
            case 'DownloadFolderImported':
                if (!req.body.data || !req.body.data.importedPath) {
                    console.warn('Request received for downloadFolderImported without an importedPath');
                    res.json({
                        success: false,
                        detail: {
                            type: 'webhook/arr/add',
                            error: 'No file path provided in event'
                        }
                    });
                    return;
                }
                const addedPosition = this.queue.addToQueue(req.body.data.importedPath);
                res.json({
                    success: true,
                    detail: {
                        type: 'webhook/arr/add',
                        position: addedPosition
                    }
                });
                break;
            case 'EpisodeFileDeleted':
            case 'episodeFileDeleted':
            case 'MovieFileDeleted':
            case 'movieFileDeleted':
                if (!req.body.sourceTitle) {
                    console.warn('Request received for episodeFileDeleted/movieFileDeleted without a sourceTitle');
                    res.json({
                        success: false,
                        detail: {
                            type: 'webhook/arr/remove',
                            error: 'No file path provided in event'
                        }
                    });
                    return;
                }
                const deletedPosition = this.queue.removeFromQueue(req.body.sourceTitle);
                res.json({
                    success: true,
                    detail: {
                        type: 'webhook/arr/remove',
                        position: deletedPosition
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
