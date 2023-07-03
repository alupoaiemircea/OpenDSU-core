const { createCommandObject } = require("./lib/createCommandObject");

function CloudEnclave(clientDID, remoteDID, requestTimeout) {
    let initialised = false;
    const DEFAULT_TIMEOUT = 30000;

    this.commandsMap = new Map();
    this.requestTimeout = requestTimeout ?? DEFAULT_TIMEOUT;
    
    const ProxyMixin = require("./ProxyMixin");
    ProxyMixin(this);

    const init = async () => {
        try {
            const w3cDID = require("opendsu").loadAPI("w3cdid");
            this.clientDIDDocument = await $$.promisify(w3cDID.resolveDID)(clientDID);
            this.remoteDIDDocument = await $$.promisify(w3cDID.resolveDID)(remoteDID);
        }
        catch (err) {
            console.log(err);
        }
        this.initialised = true;
        this.dispatchEvent("initialised");
        this.subscribe();
    }

    this.isInitialised = () => {
        return initialised;
    }

    this.getDID = (callback) => {
        callback(undefined, did);
    }

    this.callLambda = (lambdaName, ...args) => {
        this.__putCommandObject(lambdaName, ...args);
    }

    this.__putCommandObject = (commandName, ...args) => {
        const callback = args.pop();
        args.push(clientDID);

        const command = JSON.stringify(createCommandObject(commandName, ...args));
        const commandID = JSON.parse(command).commandID;
        this.commandsMap.set(commandID, { "callback": callback, "time": Date.now() });

        if (this.commandsMap.size === 1) {
            this.clientDIDDocument.startWaitingForMessages();
        }

        this.clientDIDDocument.sendMessage(command, this.remoteDIDDocument, (err, res) => {
            if (err) {
                console.log(err);
            }
            setTimeout(this.checkTimeout, this.requestTimeout, commandID);
        });
    }

    this.subscribe = () => {
        this.clientDIDDocument.subscribe((err, res) => {
            if (err) {
                console.log(err);
                return;
            }

            try {
                const resObj = JSON.parse(res);
                const commandResult = resObj.commandResult;
                const commandID = resObj.commandID;

                if (!this.commandsMap.get(commandID)) return;

                const callback = this.commandsMap.get(commandID).callback;
                callback(err, JSON.stringify(commandResult));

                this.commandsMap.delete(commandID);
                if (this.commandsMap.size === 0) {
                    this.clientDIDDocument.stopWaitingForMessages();
                }
            }
            catch (err) {
                console.log(err);
            }
        })
    }

    this.checkTimeout = (commandID) => {
        if (!this.commandsMap.has(commandID)) return;

        const callback = this.commandsMap.get(commandID).callback;
        callback(createOpenDSUErrorWrapper(`Timeout for command ${commandID}`), undefined);
        this.commandsMap.delete(commandID);
        if (this.commandsMap.size === 0) {
            this.clientDIDDocument.stopWaitingForMessages();
        }
    }

    init();
}

module.exports = CloudEnclave;