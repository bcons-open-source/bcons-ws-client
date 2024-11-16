/**
 * WebSocket client for bcons server communication.
 * Handles connection management, authentication, and message handling.
 */
export class BconsWS {
  // Class properties that can be customized via constructor options.

  // User token required for authentication and message reception on the bcons server.
  userToken = "";

  // WebSocket server endpoint (nicknamed "Fry" as that delivery guy).
  wsServer = "wss://bcons.dev/fry";

  // Identifier for the device running this console. Examples:
  // - "BE" for web extension
  // - "BWC" for bcons website
  // Custom identifiers can be used to track connected devices.
  device = "custom";

  // Logging callback functions for info and error messages.
  // If not provided, messages will be logged to the console.
  errLog = null;
  msgLog = null;

  // Callback function invoked when a message is received.
  // @param {object} message - The received message object
  onMessage = null;

  // Internal properties (not meant to be modified directly)

  // Active WebSocket connection instance
  ws = null;

  // Counter for connection retry attempts
  reconnectCount = 0;

  // Timer ID for reconnection attempts
  reconnectTimerId = null;

  // Currently active WebSocket server URL
  currentWsServer = "wss://bcons.dev/fry";

  constructor(options) {
    // Overwrite default options
    ["userToken", "wsServer", "device", "onMessage", "msgLog", "errLog"].forEach(
      (key) => {
        if (typeof options[key] !== "undefined") {
          this[key] = options[key];
        }
      }
    );

    this.currentWsServer = this.wsServer;
  }

  connect() {
    // A user token is mandatory
    if (!this.userToken) {
      this.logErr("User token required for BconsWS init");
      return;
    }

    // We also need a server to connect to
    if (!this.currentWsServer) {
      this.logErr("No Fry server provided, aborting.");
      return;
    }

    this.log("Connecting to Fry");

    // Only connect if not connecting (0), open (1) or closing (2)
    if (this.ws && this.ws.readyState != 3) {
      this.log("Websocket readyState is", this.ws.readyState, ". Aborting");
      return;
    }

    this.log("WS creation", this.currentWsServer);
    this.ws = new WebSocket(this.currentWsServer);

    this.ws.onopen = () => {
      this.log("[ws] Connection established");
      this.reconnectCount = 0;
      this.ws.send(
        `{"e": "auth", "userToken":"${this.userToken}", "device":"${this.device}"}`
      );
    };

    this.ws.onclose = (e) => {
      if (e.wasClean) {
        this.log("WS connection closed clean");
        this.log(e);
        if (e.code == 302) {
          this.currentWsServer = e.reason;
          this.log("Forwarding to", this.currentWsServer);
          this.connect();
        }

        if (e.code > 400 && e.code < 500) {
          const content = { errorCode: e.code, reason: e.reason };
          if (this.onMessage) {
            setTimeout(() => this.onMessage(content), 3000);
          }
        }
      } else {
        // Server closed dirty, try to reconnect
        this.log(
          "Disconnected, will try to reconnect. Retry count:",
          this.reconnectCount
        );

        let retry = 1000;
        ++this.reconnectCount;

        // Increase reconnection time to avoid ddosing the server
        if (this.reconnectCount > 20) {
          retry = 10000;
        } else if (this.reconnectCount > 10) {
          retry = 7000;
        } else if (this.reconnectCount > 5) {
          retry = 5000;
        }

        // After 5 retries switch to the server provided in the constructor.
        // This allows the load balancer to redirect us to a live server.
        if (this.reconnectCount > 5 && this.currentWsServer != this.wsServer) {
          this.log("Switching to", this.wsServer);
          this.currentWsServer = this.wsServer;
          retry = 1000;
        }

        if (this.reconnectTimerId) {
          clearTimeout(this.reconnectTimerId);
        }
        this.reconnectTimerId = setTimeout(() => this.connect(), retry);
      }
    };

    this.ws.onerror = (error) => {
      this.logErr(`[ws]`, error);
    };

    this.ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        // Call the provided callback
        if (this.onMessage) {
          this.onMessage(data);
        }
      } catch (e) {
        this.logErr(e);
      }
    };
  }

  send(message) {
    // We can only send if socket is open
    if (this.ws.readyState != 1) {
      return;
    }

    if (typeof message != "string") {
      message = JSON.stringify(message);
    }

    this.ws.send(message);
  }

  disconnect() {
    this.log("Closing WS");
    if (this.ws) {
      this.ws.close();
    }
  }

  log(...params) {
    if (this.msgLog) {
      this.msgLog(...params);
    } else {
      console.log(...params); // eslint-disable-line no-console
    }
  }

  logErr(...params) {
    if (this.errLog) {
      this.errLog(...params);
    } else {
      console.error(...params);
    }
  }
}

