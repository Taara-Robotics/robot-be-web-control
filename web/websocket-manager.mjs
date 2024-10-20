import {BackOffDelay} from "./backoff-delay.mjs";
import {EventEmitter} from "./event-emitter.mjs";

export class WebsocketManager extends EventEmitter {
    constructor(address) {
        super();
        this.address =  address;
        this.socketReconnectDelay = new BackOffDelay();
        this.socket = this.createWebsocket();
    }

    onSocketOpened() {
        this.socketReconnectDelay.reset();
    }

    onSocketClosed() {
        setTimeout(() => {
            this.socket = this.createWebsocket();
        }, this.socketReconnectDelay.get());
    }

    createWebsocket() {
        const socket = new WebSocket('ws://' + (this.address || window.location.host));

        socket.addEventListener('message', (data) => {
            //console.log(data);
            this.emit('message', data);
        });

        socket.addEventListener('close', (event) => {
            console.log('socket closed', event.code, event.reason);
            this.onSocketClosed();
        });

        socket.addEventListener('error', () => {
            console.log('socket error');
        });

        socket.addEventListener('open', () => {
            console.log('socket opened');
            this.onSocketOpened();
            this.emit('open');
        });

        return socket;
    }

    send(info, callback) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(info), callback);
        } else if (typeof callback === 'function') {
            callback();
        }
    }
}