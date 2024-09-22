import {sack} from "sack.vfs"
const StoredObject = sack.ObjectStorage.StoredObject;
import {l} from "../userDb.mjs"

export class UniqueIdentifier extends StoredObject {
	key = null;
	created = new sack.JSOX.DateNS();
	constructor() {
		super(l.storage);
	}
	store( ) {
		super.store();
		console.log( "??? Store of identifier was called");
	}
}
