import {sack} from "sack.vfs"
const StoredObject = sack.ObjectStorage.StoredObject;

import {l} from "../userDb.mjs"



export class StoredSash{
	service = null;
	sash = new Sash(); // the real result
}

export function sashToJSOX(stringifier) {
	const keys = Object.keys( this );
	//keys.push( "id" );
	const mirror = {service : this.service};
	for( let key of keys ) mirror[key] = this[key];
	//console.trace( " ------------  SASH  ----------- Stringify sash mirror:", mirror );
	const r = stringifier.stringify( mirror );
	//console.log( " --- BECAME:", r );
	return r;
	
}

export function sashFromJSOX(field,val) {
	//console.log( "Sash revival method:", this, field, val );
	if( !field ) {
		if( this.service instanceof Promise ) this.service.then( val=>this.sash.set( val ) );
		else   this.sash.set( this.service )
		return this.sash;
	}

	if( field === "service" ) return this.service = val;
	if( field=== "badges" ) return this.sash.badges = val;
	return this.sash[field] = val;
}

export class Sash extends StoredObject{
	#service = null;
	name = null;  // name of the sash
	master = false;
	badges = []; // this sash has these badges.
	constructor( ) {
		super( l.storage );
	}
	get service() {
		return this.#service;
	}
	set( service, name, master ) {
		this.#service = service;
		if( name ){
			if( master ) this.master = master;
			this.name = name;
			this.store();
		}else {
			//console.log( "This badges and badge without set?", this.badges );
			this.badges.forEach( badge=>((badge instanceof Promise)?badge.then( badge=>badge.set(service) ):badge.set( service )) );
		}
		return this;
	}
	clone( sash ) {
		console.log( "sash clone This?", this, this.badges )
		this.badges.forEach( (b)=>sash.badges.push(b) );
		return this;
	}
	addBadge( badge ) {
		this.badges.push( badge );
	}
	getPerms() {
		const p = {};
		for( let b of this.service.masterSash.badges )
			p[b.tag] = false;
		for( let b of this.badges )
			p[b.tag] = true;
		return p;
	}
        for( domain ) {
        	// // test sash.for( domain ) true....
		if( !this.#service ) console.log( "Sash does not belong to a service?" );
        	return ( this.#service.domain === domain );
        }
	store() {
		//console.trace( "WHO IS SAVING A SASH SO EARLY?" );
		super.store();
	}
}

export class SashAlias extends StoredObject{
	name = null;  // name of the sash
	sash = null;
	constructor( name, sash ) {
		super( l.storage );
		this.name = name;
		this.sash = sash;
	}	
}
