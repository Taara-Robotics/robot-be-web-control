import WebSocket, {WebSocketServer} from 'ws';
import express from 'express';
import http from "http";
import {Buffer} from "node:buffer";
import {SerialPort} from 'serialport'

let robotConfig = {
    robotRadius: 0.18,
    wheelRadius: 0.08,
    wheelFromCenter: 0.051,
    metricToRobot: 1
};

robotConfig.metricToRobot = 1 / (robotConfig.wheelRadius * 2 * Math.PI);

let serialport = null;

const wheelVelocities = [null, null];
let smoothing = 0.25;

const webUIPort = 8777;

const app = express();
const server = http.createServer(app);

app.use(express.static('web'))
app.use(express.json());

const wss = new WebSocketServer({server}, () => {
    console.log('Opened websocket');
});

const serialPortDisconnectDelay = 2000;
let serialPortDisconnectTimeout = null;

let activeClientWebSocket = null;

wss.on('connection', (ws, req) => {
    console.log('connection', req.connection.remoteAddress, req.connection.remotePort);

    activeClientWebSocket = ws; // latest connection will be active

    clearTimeout(serialPortDisconnectTimeout);

    connectSerialPort();

    ws.on('message', (message, isBinary) => {
        //console.log(Date.now(), 'received', message.toString());

        if (ws === activeClientWebSocket) {
            handleMessage(message.toString(), ws);
        }
    });

    ws.on('close', () => {
        console.log('disconnected');

        if (ws === activeClientWebSocket) {
            activeClientWebSocket = null;

            setVelocities([null, null]);

            serialPortDisconnectTimeout = setTimeout(() => {
                disconnectSerialPort();
            }, serialPortDisconnectDelay);
        }
    });

    ws.on('error', console.error);
});

server.listen(webUIPort, function listening() {
    console.log('Listening on %d', server.address().port);
    console.log('http://localhost:' + server.address().port);
});

function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

function isSerialPortOpen() {
    return serialport && serialport.isOpen;
}

async function connectSerialPort() {
    if (isSerialPortOpen()) {
        return;
    }

    const portInfos = await SerialPort.list();
    let portPath = null;

    for (const portInfo of portInfos) {
        if (portInfo.vendorId === '0483' && portInfo.productId === '5740') {
            portPath = portInfo.path;
            break;
        }
    }

    if (portPath === null) {
        console.error('Serial port not found');
        return;
    }

    console.log('Found serial port', portPath);

    serialport = new SerialPort({
        path: portPath,
        baudRate: 115200,
    });

    serialport.on('error', (err) => {
        console.log('Serial port error:', err.message)
    });

    serialport.on('data', (data) => {
        if (!(data[0] === 0x4f && data[1] === 0x4b)) { // if not OK
            console.log('Serial port data:', data, data.toString());
        }
    });
}

async function disconnectSerialPort() {
    sendVelocities([null, null]);
    await new Promise(resolve => setTimeout(resolve, 200));

    if (isSerialPortOpen()) {
        serialport.close();
        console.log('Serial port closed');
    }
}

function handleMessage(message, socket) {
    try {
        let info = JSON.parse(message);

        // console.log(info);

        if (Array.isArray(info.vs) && info.vs.length === 2) {
            setVelocities(info.vs);
        }

        if (isNumber(info.smoothing)) {
            smoothing = info.smoothing;
        }
    } catch (e) {
        console.error(e);
    }
}

function setVelocities(velocities, callback) {
    wheelVelocities[0] = velocities[0] ?? null;
    wheelVelocities[1] = velocities[1] ?? null;

    // for (const [i, velocity] of velocities.entries()) {
    //     const id = i + 1;

    //     if (isNumber(velocity)) {
    //         send(id, velocity);
    //     } else {
    //         sendStop(id);
    //     }
    // }

    if (typeof callback === 'function') {
        callback();
    }
}

function sendVelocities(velocities, callback) {
    console.log('sendVelocities', velocities);
    for (const [i, velocity] of velocities.entries()) {
        const id = i + 1;

        if (isNumber(velocity)) {
            send(id, velocity);
        } else {
            sendStop(id);
        }
    }

    if (typeof callback === 'function') {
        callback();
    }
}

function send(id, velocity = 0.0) {
    if (!isSerialPortOpen()) {
        //connectSerialPort();
        return;
    }

    const bufBusId = Buffer.alloc(2)

    bufBusId.writeUint16BE(id);

    const buf = Buffer.alloc(24, 0x50); // length must be divisible by 4 if between 8 and 64 bytes, padded with 0x50

    buf.writeUint8(0x01, 0); // write int8 to 1 register, 0x00 | 0x01
    buf.writeUint8(0x00, 1); // mode register
    buf.writeUint8(0x0A, 2); // position mode

    buf.writeUint8(0x0E, 3); // write float to 2 registers, 0x0c | 0x02
    buf.writeUint8(0x20, 4); // 0x20 position command register, 0x21 velocity command register
    buf.writeFloatLE(NaN, 5) // position
    buf.writeFloatLE(velocity, 9) // velocity

    buf.writeUint8(0x0E, 13); // write float to 2 registers, 0x0c | 0x02
    buf.writeUint8(0x23, 14); // 0x23 Kp scale register, 0x24 Kd scale register
    buf.writeFloatLE(4.0, 15) // Kp scale
    buf.writeFloatLE(4.0, 19) // Kd scale

    const busIdHex = bufBusId.toString('hex').toUpperCase();
    const dataHex = buf.toString('hex').toUpperCase();
    const command = `can send ${busIdHex} ${dataHex}\n`

    //process.stdout.write(command);

    serialport.write(command);
}

function sendStop(id) {
    if (!isSerialPortOpen()) {
        //connectSerialPort();
        return;
    }

    const bufBusId = Buffer.alloc(2)

    bufBusId.writeUint16BE(id);

    const busIdHex = bufBusId.toString('hex').toUpperCase();
    const command = `can send ${busIdHex} 010000\n`

    serialport.write(command);
}

function calcSpeeds(xSpeed = 0, ySpeed = 0, rotation = 0) {
    const rotationalSpeed = speedMetricToRobot(rotationRadiansToMetersPerSecond(rotation));
    const speed = Math.sqrt(xSpeed * xSpeed + ySpeed * ySpeed);
    const angle = Math.atan2(ySpeed, xSpeed);

    const speeds = [0, 0, 0];

    speeds[0] = speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel1Angle / 180 * Math.PI)) + rotationalSpeed;
    speeds[1] = speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel2Angle / 180 * Math.PI)) + rotationalSpeed;
    speeds[2] = speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel3Angle / 180 * Math.PI)) + rotationalSpeed;

    return speeds;
}
function wheelSpeed(robotSpeed, robotAngle, wheelAngle) {
    return robotSpeed * Math.cos(wheelAngle - robotAngle);
}

function speedMetricToRobot(metersPerSecond) {
    return metersPerSecond * robotConfig.metricToRobot;
}

function speedRobotToMetric(wheelSpeed) {
    if (robotConfig.metricToRobot === 0) {
        return 0;
    }

    return wheelSpeed / robotConfig.metricToRobot;
}

function rotationRadiansToMetersPerSecond(radiansPerSecond) {
    return radiansPerSecond * robotConfig.wheelFromCenter;
}

async function exitHandler(options, err) {
    console.log('exitHandler', options);

    if (err) {
        console.log(err.stack);
    }

    clearInterval(sendInterval);

    await disconnectSerialPort();

    process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {cleanup: true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit: true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit: true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit: true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit: true}));

// for (let i = 0; i < 100; i++) {
//     send(1, 1.1);
//     send(2, -1.1);
//     await new Promise(resolve => setTimeout(resolve, 50));
// }
//
// sendStop(1);
// sendStop(2);
// await new Promise(resolve => setTimeout(resolve, 500));


const smoothedVelocities = [0, 0];

let sendInterval = setInterval(async () => {
    // smooth the input wheelVelocities
    for (let i = 0; i < 2; i++) {
        const velocity = wheelVelocities[i] || 0;
        smoothedVelocities[i] = smoothedVelocities[i] * smoothing + velocity * (1 - smoothing);

        // Send null to stop motors if there is no input and the speed has been smoothed to zero
        if (!isNumber(wheelVelocities[i]) && Math.abs(smoothedVelocities[i]) < 0.01) {
            smoothedVelocities[i] = null;
        }
    }

    sendVelocities(smoothedVelocities);
}, 50);