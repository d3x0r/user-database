import {sack} from "sack.vfs"
const StoredObject = sack.ObjectStorage.StoredObject;

import {l} from "../userDb.mjs"

export class Badge  extends StoredObject{
	tag = null;   // what the program calls it
	name = null;  // token name
	description = null; // be nice to include a description?
	#service = null;
	constructor() {
		super( l.storage );
	}
	get service() {
		return this.#service;
	}
	get domain() {
		return this.service.domain;
	}
	get label() {
		return this.service.name + "@" + this.service.domain.name;
	}
	get fullName() {
		return this.name + " for " + this.service.name + " in " + this.service.domain.name + " of " + this.service.domain.org.name;
	}
	set( service, tag, name, desc) {
		this.#service = service;
		if( name ) {
			//this.badgeId = sack.Id();
			this.tag = tag;
			this.name = name;
			this.description = desc;
			this.store();
		}
		return this;
	}
}

