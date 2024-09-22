import {sack} from "sack.vfs"
const JSOX = sack.JSOX;

const StoredObject = sack.ObjectStorage.StoredObject;

import { StoredDomain } from "./Domain.mjs";
import {User} from "./User.mjs"
import {l} from "../userDb.mjs"

export class StoredOrganization{
	orgId = null;
	name = null;
	createdBy = null;
	domains = [];
	org = new Organization();
	constructor() {

	}
}

export function orgFromJSOX(field,val) {
	try {
	if( !field ) {
		this.org.domains.forEach( domain=>{ ( domain instanceof Promise )?domain.then(domain=>
				 ((domain instanceof StoredDomain)?domain.domain.set(this): domain.set(this)) ) : domain.set( this ) } );
		return this.org;
	}
	return this.org[field] = val;
	}catch(err) { console.log( "ORG REVIVAL EXCEPTION:", err ); }
}

export class Organization  extends StoredObject{
	orgId = null;
	name = null;
	createdBy = null;
	domains = [];
	#registrations = [];
	//members = new SlabArray( l.storage );
	constructor() {
		super( l.storage );
	}

	async store() {
		await super.store();
		await l.orgs.set( this.name, this ); 
		//for( n = 0; 
	}

	// get a badge for this org.
	// users have sashes with badges 
	//  after getting a badge, then user's active sash should be used.
	// 
	async getBadge( name, forUser ) {
		const badge = this.badges.find( badge=>badge.name===name );	
		if( !badge ) {
			
		}
	}

	async addDomain( msg ){
		const reg = { p:null, res:null,rej:null,msg:msg };
		reg.p = new Promise( (res,rej)=>{
			reg.res = res; reg.rej=rej;
		} );
		console.log( "Adding domain to Org private", reg );
		this.#registrations.push( reg );
		return reg.p;
	}
	async getDomain( name, forUser ) {
		//console.log( "Org is still pending???", this.domains, this );
		const domain = this.domains.find( domain=>domain.name===name );	
		if( !domain ) {
			console.log( "Creating domain" );
			const newDomain = new Domain().set( this, name, forUser );
			this.domains.push( newDomain );
			newDomain.store();
			this.store();
			UserDb.on( "newDomain", newDomain );
			return newDomain;
		} else {
			return domain;
		}
	}

	static async get( name, forClient ) {
		const org = await l.orgs.get( name );
		if( !org && forClient ){
			const org = await Organization.new( name, forClient );
			return org;
		}
		return org;
	}
	
	
	
	static async new( name, forUser ) {
		if( !(forUser instanceof User ) ) 
			throw new Error( "Required object User incorrect." + JSOX.stringify(forUser ) );
		console.log( "Creating Org" );
		const org = new Organization();
		org.name = name;
		org.createdBy = forUser;
		org.orgId = sack.Id();
	
		return org.store().then( (id)=>org );
	}
	
}

