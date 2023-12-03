import OrmService from './orm/service.js';
import { State } from './orm/enums.js';

class Queue {
    constructor(options, detect, cropFile) {
        this.cliOptions = options;
        this.detectFunction = detect;
        this.cropFileFunction = cropFile;

        this.pathMappingsFunction = this._getPathMappings(options.paths);
        this.consumptionInProgress = false;
        this.itemBeingConsumed = null;

        OrmService.run(`
                update Queue
                set    state        = :newstate,
                       last_updated = datetime()
                where  state        = :oldstate
            `, {
                ':oldstate': State.Pending.getId(),
                ':newstate': State.Abort.getId()
            });
    }

    async _updateQueueState(id, state) {
        await OrmService.run(`
                update Queue
                set    state        = :state,
                       last_updated = datetime()
                where  id           = :id
            `, {
                ':id': id,
                ':state': state.getId()
            });
    }

    async _getRemainingQueueCount() {
        return (await OrmService.get(`
                select count(*) as count
                from Queue
                where state = :state
            `, {
                ':state': State.Pending.getId()
            }))
            .count;
    }

    async _getNextQueueItem() {
        return await OrmService.get(`
                select *
                from Queue
                where state = :state
            `, {
                ':state': State.Pending.getId()
            });
    }

    async _consumeFromQueue() {
        if (this.consumptionInProgress) {
            return;
        }
        this.consumptionInProgress = true;

        while ((await this._getRemainingQueueCount()) > 0) {
            this.itemBeingConsumed = await this._getNextQueueItem();
            
            console.info(`Starting crop on ${JSON.stringify(this.itemBeingConsumed, null, 4)}`);
            try {
                await this._updateQueueState(this.itemBeingConsumed.id, State.Active);
                await this.cropFileFunction(this.itemBeingConsumed, 'in-place', this.cliOptions);
                await this._updateQueueState(this.itemBeingConsumed.id, State.Complete);
            } catch (e) {
                console.error(e);
                await this._updateQueueState(this.itemBeingConsumed.id, State.Abort);
            }
            console.info(`Crop complete on ${JSON.stringify(this.itemBeingConsumed, null, 4)}`);
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

    async addToQueue(name, path, localSource, remoteSource, remoteGroup) {
        const newFile = this.pathMappingsFunction(path);
        const exists = await OrmService.get(`
                select id
                from Queue
                where state in (:pendingstate, :activestate)
                and path = :path
            `, {
                ':pendingstate': State.Pending.getId(),
                ':pendingstate': State.Active.getId(),
                ':path': newFile
            });

        if (exists && exists.id) {
            return exists.id;
        }

        // There is a race here between above and the following.
        // But it's unlikely, and probably won't cause issues.
        const newItem = await OrmService.run(`
                insert into Queue (
                    state,
                    name,
                    path,
                    added_at,
                    last_updated,
                    local_source,
                    remote_source,
                    remote_group
                )
                values (
                    :state,
                    :name,
                    :path,
                    datetime(),
                    datetime(),
                    :localsource,
                    :remotesource,
                    :remotegroup
                )
                returning id
            `, {
                ':state': State.Pending.getId(),
                ':name': name,
                ':path': newFile,
                ':localsource': localSource.getId(),
                ':remotesource': remoteSource.getId(),
                ':remotegroup': remoteGroup.getId()
            });
        
        this._consumeFromQueue();
        return newItem.id;
    }

    async removeFromQueue(path) {
        const deletedFile = this.pathMappingsFunction(path);
        const removed = await OrmService.run(`
                update Queue
                set   state        = :state,
                      last_updated = datetime()
                where path         = :path
                returning id
            `, {
                ':state': State.Skip,
                ':path': deletedFile
            });
        return removed.id || -1;
    }

    async getQueueItems() {
        return await OrmService.all(`
                select *
                from Queue
                where state in (:pending, :active)
            `, {
                ':pending': State.Pending.getId(),
                ':active': State.Active.getId()
            });
    }
}

export default Queue;
