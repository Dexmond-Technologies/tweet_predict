const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const idl = require('./idl.json');
// Let's monkeypatch typeSize to see exactly what argument it receives before it crashes
const IdlCoder = require('@coral-xyz/anchor/dist/cjs/coder/borsh/idl').IdlCoder;

const origSize = IdlCoder.typeSize;
IdlCoder.typeSize = function (ty, idl_ref, genericArgs) {
    try {
        const result = origSize.apply(this, arguments);
        if (result === undefined) {
             console.log("typeSize returned undefined for", JSON.stringify(ty));
        }
        return result;
    } catch(e) {
        if (e.message.includes('size')) {
             console.log("typeSize crashed on", JSON.stringify(ty));
             console.log("Error:", e.stack);
        }
        throw e;
    }
};

const PROGRAM_ID = new PublicKey('5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR');
const provider = new anchor.AnchorProvider(new Connection("http://localhost"), {publicKey: PROGRAM_ID}, {});

try {
    const program = new anchor.Program(idl, PROGRAM_ID, provider);
    console.log("Loaded OK!");
} catch (e) {
    if (!e.message.includes("Cannot read properties of undefined (reading 'size')")) {
        console.error(e);
    }
}
