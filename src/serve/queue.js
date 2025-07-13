import sqlite3 from 'sqlite3';

const MAX_POLL_INTERVAL = 3600000; // 1 hour in milliseconds
const MIN_POLL_INTERVAL = 300000; // 5 minutes in milliseconds

class Queue {
    constructor(options, detect, cropFile) {
        this.cliOptions = options;
        this.detectFunction = detect;
        this.cropFileFunction = cropFile;
        this.pathMappingsFunction = this._getPathMappings(options.paths);
        this.consumptionInProgress = false;
        this.itemBeingConsumed = null;
        this.processingWindows = options.window || [];
        this.db = new sqlite3.Database(options.config);
        this.wakeUpPoll = null;
        
        // Create table if it doesn't exist
        this.db.run(`
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        if (this.processingWindows.some(window => !window.hours)) {
            throw new Error('All processing windows must specify hours');
        }

        this._consumeFromQueue();
    }

    _isWithinWindow() {
        if (this.processingWindows.length === 0) {
            // No windows specified, always allowed
            return true;
        }
        const now = new Date();
        // Check if current time is within any of the specified cron windows
        return this.processingWindows.some(({ cron, hours }) => {
            cron.reset(now)
            const lastStart = cron.prev();
            const end = new Date(lastStart.getTime() + hours * 60 * 60 * 1000);
            return lastStart.getTime() <= now.getTime() && now.getTime() < end.getTime();
        });
    }

    async _pollWakeup() {
        const now = new Date();
        const nextWindowStartsAt = this.processingWindows
            .map(({ cron }) => {
                cron.reset(now);
                return cron.next();
            })
            .reduce((previous, current) => previous.getTime() > current.getTime() ? current : previous);
        
        const millisUntilNextWindow = Math.max(0, nextWindowStartsAt.getTime() - Date.now());
        const timeToWait = Math.max(Math.min(millisUntilNextWindow, MAX_POLL_INTERVAL), MIN_POLL_INTERVAL);
        console.info(`Next poll at ${new Date(Date.now() + timeToWait).toString()}. Waiting...`);
        this.wakeUpPoll = setTimeout(this._consumeFromQueue.bind(this), timeToWait);
    }

    async _consumeFromQueue() {
        if (this.consumptionInProgress) {
            return;
        }
        if (this.wakeUpPoll) {
            clearTimeout(this.wakeUpPoll);
            this.wakeUpPoll = null;
        }
        this.consumptionInProgress = true;

        try {
            while (true) {
                if (!this._isWithinWindow()) {
                    console.info('Queue processing paused: outside allowed windows');
                    break;
                }

                // Get the next pending item
                const nextItem = await new Promise((resolve, reject) => {
                    this.db.get(
                        'SELECT path FROM queue WHERE status = ? ORDER BY created_at ASC LIMIT 1',
                        ['pending'],
                        (err, row) => err ? reject(err) : resolve(row)
                    );
                });

                if (!nextItem) {
                    break; // No more items to process
                }

                this.itemBeingConsumed = nextItem.path;
                console.info(`Starting crop on ${this.itemBeingConsumed}`);
                
                try {
                    await this.cropFileFunction(this.itemBeingConsumed, 'in-place', this.cliOptions);
                    // Update status to completed
                    await new Promise((resolve, reject) => {
                        this.db.run(
                            'UPDATE queue SET status = ? WHERE path = ?',
                            ['completed', this.itemBeingConsumed],
                            err => err ? reject(err) : resolve()
                        );
                    });
                } catch (e) {
                    console.error(e);
                    // Update status to failed
                    await new Promise((resolve, reject) => {
                        this.db.run(
                            'UPDATE queue SET status = ? WHERE path = ?',
                            ['failed', this.itemBeingConsumed],
                            err => err ? reject(err) : resolve()
                        );
                    });
                }
                
                console.info(`Crop complete on ${this.itemBeingConsumed}`);
            }
        } finally {
            this.consumptionInProgress = false;
            this.itemBeingConsumed = null;
        }

        this._pollWakeup();
    }

    _getPathMappings(paths) {
        const mappings = paths.split(',')
            .filter(mapping => mapping !== '')
            .map(spl => spl.split(':'))
            .filter(mapping => mapping.length === 2);
        return path => {
            for (let mapping of mappings) {
                path = path.replaceAll(mapping[0], mapping[1]);
            }
            return path;
        };
    }

    async addToQueue(path) {
        const newFile = this.pathMappingsFunction(path);
        
        try {
            // Try to insert the new file
            await new Promise((resolve, reject) => {
                this.db.run(
                    'INSERT OR IGNORE INTO queue (path) VALUES (?)',
                    [newFile],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            // Get the position of this item
            const position = await new Promise((resolve, reject) => {
                this.db.get(
                    'SELECT COUNT(*) as pos FROM queue WHERE created_at <= (SELECT created_at FROM queue WHERE path = ?)',
                    [newFile],
                    (err, row) => err ? reject(err) : resolve(row.pos - 1)
                );
            });

            this._consumeFromQueue();
            return position;
        } catch (err) {
            console.error('Error adding to queue:', err);
            return -1;
        }
    }

    async removeFromQueue(path) {
        const deletedFile = this.pathMappingsFunction(path);
        
        try {
            // Update status to 'cancelled' instead of deleting
            const result = await new Promise((resolve, reject) => {
                this.db.run(
                    'UPDATE queue SET status = ? WHERE path = ? AND status = ?',
                    ['cancelled', deletedFile, 'pending'],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
            
            return result > 0 ? 0 : -1;
        } catch (err) {
            console.error('Error removing from queue:', err);
            return -1;
        }
    }

    async getQueueItems() {
        try {
            const items = await new Promise((resolve, reject) => {
                this.db.all(
                    'SELECT path FROM queue WHERE status = ? ORDER BY created_at ASC',
                    ['pending'],
                    (err, rows) => err ? reject(err) : resolve(rows.map(row => row.path))
                );
            });

            if (this.consumptionInProgress && this.itemBeingConsumed) {
                return [this.itemBeingConsumed, ...items];
            }
            return items;
        } catch (err) {
            console.error('Error getting queue items:', err);
            return [];
        }
    }
}

export default Queue;
