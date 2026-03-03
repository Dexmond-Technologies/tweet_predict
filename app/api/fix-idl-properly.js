const fs = require('fs');

// We know the 0.32 IDL puts the actual type definitions in `idl.types` and leaves `idl.accounts` with just `target` discriminator.
// `anchor@0.30.1` expects `type` inline inside `idl.accounts[i]`!
const idl = JSON.parse(fs.readFileSync('idl.json'));

idl.accounts = idl.accounts.map(acc => {
    // Find the definition in `idl.types`
    const typeDef = idl.types.find(t => t.name.toLowerCase() === acc.name.toLowerCase());
    if (typeDef) {
        // inline the type into the account
        acc.type = typeDef.type;
        console.log("Inlined type for account:", acc.name);
    } else {
        console.log("Could not find type for account:", acc.name);
        acc.type = { kind: 'struct', fields: [] }; // fallback
    }
    return acc;
});

fs.writeFileSync('idl.json', JSON.stringify(idl, null, 2));
