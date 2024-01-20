import {getAttestations} from "./utils";

async function f() {
    console.log((await getAttestations()).length)
}

f()
