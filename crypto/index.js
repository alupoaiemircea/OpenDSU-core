const keySSIResolver = require("key-ssi-resolver");
const cryptoRegistry = keySSIResolver.CryptoAlgorithmsRegistry;
const keySSIFactory = keySSIResolver.KeySSIFactory;
const SSITypes = keySSIResolver.SSITypes;
const jwtUtils = require("./jwt");

const templateSeedSSI = keySSIFactory.createType(SSITypes.SEED_SSI);
templateSeedSSI.load(SSITypes.SEED_SSI, "default");

const { JWT_ERRORS } = jwtUtils;

const hash = (keySSI, data, callback) => {
    if (typeof data === "object" && !Buffer.isBuffer(data)) {
        data = JSON.stringify(data);
    }
    const hash = cryptoRegistry.getHashFunction(keySSI);
    callback(undefined, hash(data));
};

const encrypt = (keySSI, buffer, callback) => {
    const encrypt = cryptoRegistry.getEncryptionFunction(keySSI);
    callback(undefined, encrypt(buffer, keySSI.getEncryptionKey()));
};

const decrypt = (keySSI, encryptedBuffer, callback) => {
    const decrypt = cryptoRegistry.getDecryptionFunction(keySSI);
    let decryptedBuffer;
    try {
        decryptedBuffer = decrypt(encryptedBuffer, keySSI.getEncryptionKey());
    } catch (e) {
        return callback(e);
    }
    callback(undefined, decryptedBuffer);
};

const sign = (keySSI, hash, callback) => {
    const sign = cryptoRegistry.getSignFunction(keySSI);
    callback(undefined, sign(hash, keySSI.getPrivateKey()));
};

const verifySignature = (keySSI, hash, signature, publicKey, callback) => {
    if (typeof publicKey === "function") {
        callback = publicKey;
        publicKey = keySSI.getPublicKey();
    }
    const verify = cryptoRegistry.getVerifyFunction(keySSI);
    callback(undefined, verify(hash, publicKey, signature));
};

const generateEncryptionKey = (keySSI, callback) => {
    const generateEncryptionKey = cryptoRegistry.getEncryptionKeyGenerationFunction(keySSI);
    callback(undefined, generateEncryptionKey());
};

const encode = (keySSI, data) => {
    const encode = cryptoRegistry.getEncodingFunction(keySSI);
    return encode(data);
};

const decode = (keySSI, data) => {
    const decode = cryptoRegistry.getDecodingFunction(keySSI);
    return decode(data);
};

const sha256 = (dataObj) => {
    const pskcrypto = require("pskcrypto");
    const hashBuffer = pskcrypto.objectHash("sha256", dataObj);
    return pskcrypto.pskBase58Encode(hashBuffer);
};

const encodeBase58 = (data) => {
    return encode(templateSeedSSI, data);
};
const decodeBase58 = (data) => {
    return decode(templateSeedSSI, data);
};

const createJWT = (seedSSI, scope, credentials, options, callback) => {
    jwtUtils.createJWT(
        {
            seedSSI,
            scope,
            credentials,
            options,
            hash,
            encode: encodeBase58,
            sign,
        },
        callback
    );
};

const verifyJWT = (jwt, rootOfTrustVerificationStrategy, callback) => {
    jwtUtils.verifyJWT(
        {
            jwt,
            rootOfTrustVerificationStrategy,
            decode: decodeBase58,
            hash,
            verifySignature,
        },
        callback
    );
};

const createCredential = (issuer, credentialSubject, callback) => {
    createJWT(issuer, "", null, { subject: credentialSubject }, callback);
};

const createAuthToken = (seedSSI, scope, credential, callback) => {
    createJWT(seedSSI, scope, credential, null, callback);
};

const verifyAuthToken = (jwt, listOfIssuers, callback) => {
    if (!listOfIssuers || !listOfIssuers.length) return callback(JWT_ERRORS.EMPTY_LIST_OF_ISSUERS_PROVIDED);

    // checks every credentials from the JWT's body to see if it has at least one JWT issues by one of listOfIssuers for the current subject
    const rootOfTrustVerificationStrategy = ({ body }, verificationCallback) => {
        const { sub: subject, credentials } = body;
        // the JWT doesn't have credentials specified so we cannot check for valid authorizarion
        if (!credentials) return verificationCallback(null, false);

        const credentialVerifiers = credentials.map((credential) => {
            return new Promise((resolve) => {
                verifyJWT(
                    credential,
                    ({ body }, credentialVerificationCallback) => {
                        // check if credential was issued for the JWT that we are verifying the authorization for
                        const isCredentialIssuedForSubject = body.sub === subject;
                        if (!isCredentialIssuedForSubject) return credentialVerificationCallback(null, false);

                        const isValidIssuer = listOfIssuers.some((issuer) => issuer === body.iss);
                        credentialVerificationCallback(null, isValidIssuer);
                    },
                    (credentialVerifyError, isCredentialValid) => {
                        if (credentialVerifyError) return resolve(false);
                        resolve(isCredentialValid);
                    }
                );
            }).catch(() => {
                // is something went wrong, we deny the JWT
                return false;
            });
        });

        Promise.all(credentialVerifiers)
            .then((credentialVerifierResults) => {
                const hasAtLeastOneValidIssuer = credentialVerifierResults.some((result) => result);
                if (!hasAtLeastOneValidIssuer) return verificationCallback(null, false);
                verificationCallback(null, true);
            })
            .catch(() => {
                // is something went wrong, we deny the JWT
                verificationCallback(null, false);
            });
    };

    verifyJWT(jwt, rootOfTrustVerificationStrategy, callback);
};

module.exports = {
    hash,
    encrypt,
    decrypt,
    sign,
    verifySignature,
    generateEncryptionKey,
    encode,
    decode,
    sha256,
    createJWT,
    verifyJWT,
    createCredential,
    createAuthToken,
    verifyAuthToken,
    JWT_ERRORS,
};
