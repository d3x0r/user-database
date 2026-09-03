import {sack} from "sack.vfs"
import {whenLoaded} from "sack.vfs/object-storage"

import {l,StoredObject} from "../userDb.mjs"



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
		whenLoaded( this.service, val=>this.sash.set( val ) );
		return this.sash;
	}

	if( field === "service" ) return this.service = val;
	if( field=== "badges" ) return this.sash.badges = val;
	return this.sash[field] = val;
}

// two revived copies of one sash record must still compare equal
export function sameSash( a, b ) {
	if( !a || !b ) return false;
	if( a === b ) return true;
	if( a.sashId && b.sashId ) return a.sashId === b.sashId;
	if( a.name !== b.name ) return false;
	const sa = a.service, sb = b.service;
	if( !sa || !sb ) return false;
	if( sa === sb ) return true;
	return !!sa.serviceId && sa.serviceId === sb.serviceId;
}

export class Sash extends StoredObject{
	#service = null;
	name = null;  // name of the sash
	master = false;
	badges = []; // this sash has these badges.
	sashId = null; // set on sashes created through Service.createSash; older ones match by name
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
			this.badges.forEach( badge=>whenLoaded( badge, badge=>badge.set( service ) ) );
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
	getBadge( tag ) {
		return this.badges.find( ( b )=>b && !( b instanceof Promise ) && b.tag === tag ) || null;
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
		if( !this.#service ) { console.log( "Sash does not belong to a service?" ); return false; }
		// callers pass either a domain name or a Domain/StoredDomain; a service's domain
		// may also be either form once revived from storage.
		const name = ( x )=>( "string" === typeof x ) ? x : ( x && ( x.name || ( x.domain && x.domain.name ) ) );
        	return ( name( this.#service.domain ) === name( domain ) );
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
