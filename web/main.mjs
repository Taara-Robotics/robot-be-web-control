import { WebsocketManager } from "./websocket-manager.mjs";
import { runGui, state } from "./gui.mjs";

let sendInterval;
const wsManager = new WebsocketManager();

let lastStateInput = structuredClone(state.input);

function wsSend(info) {
  wsManager.send(info);
}

function startSendInterval() {
  clearInterval(sendInterval);

  sendInterval = setInterval(() => {
    if (state.input.vs[0] === lastStateInput.vs[0] && state.input.vs[1] === lastStateInput.vs[1]) {
      return;
    }

    console.log(state.input.vs);

    wsSend({vs: state.input.vs});

    lastStateInput = structuredClone(state.input);
  }, 100);
}

function stopSendInterval() {
  clearInterval(sendInterval);
  sendInterval = null;

  wsSend({vs: [null, null]});
}

startSendInterval();

runGui(wsManager);
