import {sack} from "sack.vfs"
import {StoredObject} from "sack.vfs/object-storage-object"

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
