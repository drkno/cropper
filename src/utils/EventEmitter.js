import NodeEventEmitter from 'events';

class EventEmitter extends NodeEventEmitter {
    emit(event, ...args) {
        super.emit('*', event, ...args);
        super.emit(event, ...args);
    }
}

export default EventEmitter;
