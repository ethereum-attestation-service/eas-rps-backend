import {WebSocket, WebSocketServer} from 'ws';
import {Game} from "@prisma/client";

const wss = new WebSocketServer({ port: 8080 });

const addressToListeners = new Map<string, Set<WebSocket>>();

type SocketMessage = {
  type: string;
  data: Game | string;
};

wss.on('connection', function connection(ws) {
  let address: string | null = null;

  ws.on('error', console.error);

  ws.on('message', function message(data) {
    if (address === null) {
      address = data.toString();
      if (!addressToListeners.has(address)) {
        addressToListeners.set(address, new Set());
      }
      addressToListeners.get(address)!.add(ws);
    }
  });

  ws.on('close', function close() {
    if (address !== null) {
      addressToListeners.get(address)!.delete(ws);
    }
  });

  ws.send('something');
});

export function sendToAddress(address: string, data: any) {
  if (addressToListeners.has(address)) {
    for (const listener of addressToListeners.get(address)!) {
      listener.send(data);
    }
  }
}
