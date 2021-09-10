function WalletDBEnclave(did) {
    const openDSU = require("opendsu");
    const db = openDSU.loadAPI("db")
    const scAPI = openDSU.loadAPI("sc");
    const w3cDID = openDSU.loadAPI("w3cdid");
    const DB_NAME = "walletdb_enclave";
    const EnclaveMixin = require("./Enclave_Mixin");
    EnclaveMixin(this, did);

    const init = () => {
        scAPI.getMainDSU(async (err, mainDSU) => {
            if (err) {
                throw createOpenDSUErrorWrapper(`Failed to get mainDSU`, err);
            }
            let keySSI;
            try {
                keySSI = await $$.promisify(mainDSU.getKeySSIAsObject)();
            } catch (e) {
                throw createOpenDSUErrorWrapper(`Failed to get mainDSU's keySSI`, e);
            }

            this.storageDB = db.getWalletDB(keySSI, DB_NAME);
            this.storageDB.on("initialised", () => {
                this.finishInitialisation();
                this.dispatchEvent("initialised");
            })
        })

    };

    const bindAutoPendingFunctions = require("../../utils/BindAutoPendingFunctions").bindAutoPendingFunctions;
    bindAutoPendingFunctions(this, ["on", "off", "getDID"]);

    init();
}

module.exports = WalletDBEnclave;