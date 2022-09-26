class Queue {
    constructor(options, detect, cropFile) {
        this.queue = [];

        this.cliOptions = options;
        this.detectFunction = detect;
        this.cropFileFunction = cropFile;

        this.pathMappingsFunction = this._getPathMappings(options.paths);
        this.consumptionInProgress = false;
        this.itemBeingConsumed = null;
    }

    async _consumeFromQueue() {
        if (this.consumptionInProgress) {
            return;
        }
        this.consumptionInProgress = true;

        while (this.queue.length > 0) {
            this.itemBeingConsumed = this.queue.shift();
            console.info(`Starting crop on ${this.itemBeingConsumed}`);
            try {
                await this.cropFileFunction(this.itemBeingConsumed, 'in-place', this.cliOptions);
            } catch (e) {
                console.error(e);
            }
            console.info(`Crop complete on ${this.itemBeingConsumed}`);
        }

        this.consumptionInProgress = false;
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

    addToQueue(path) {
        const newFile = this.pathMappingsFunction(path);
        const pathIndex = this.queue.indexOf(newFile);
        if (pathIndex < 0) {
            this.queue.push(newFile);
            const position = this.queue.length - 1;
            this._consumeFromQueue();
            return position;
        }
        return pathIndex;
    }

    removeFromQueue(path) {
        const deletedFile = this.pathMappingsFunction(path);
        const deletedIndex = this.queue.indexOf(deletedFile);
        if (deletedIndex >= 0) {
            this.queue.splice(deletedIndex, 1);
        }
        return deletedIndex;
    }

    getQueueItems() {
        if (this.consumptionInProgress) {
            return [this.itemBeingConsumed].concat(this.queue);
        }
        return this.queue;
    }
}

export default Queue;
