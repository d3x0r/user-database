import {sack} from "sack.vfs"
const StoredObject = sack.ObjectStorage.StoredObject;


import {l} from "../userDb.mjs"


export class Device  extends StoredObject{
	key = null;
	active = false;
	added = new Date();
	accessed = new Date();
	constructor() {
		super(l.storage);
	}
}
