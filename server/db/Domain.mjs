const debug_ = false;

import {sack} from "sack.vfs"
import { Organization } from "./Organization.mjs";
import {Service} from "./Service.mjs"
const StoredObject = sack.ObjectStorage.StoredObject;

import {l,config_ as config, UserDb} from "../userDb.mjs"


export class StoredDomain extends StoredObject {
	domain = new Domain();
}

export function domainFromJSOX(field,val) {
	if( !field ) {
		//console.log( "domain from JSOX this?", this );
		this.domain.services.forEach( service=>((service instanceof Promise)?service.then(service=>service.set(this)):service.set( this )) );
		return this.domain;
	}
	if( field === "services" ) {
		return this.domain[field]=val;
	}
	// possible redirection of arrays and members...
	return (this.domain[field] = val),undefined;
}

export async function createInitialDomain(domain,service, user) {
	//console.trace( "Registrations?", l.registrations, domain, service, user );
	for( let r = 0; r < l.registrations.length; r++ ) {
		const regPending = l.registrations[r];
		const reg = regPending.msg;
		if( reg.domain === domain ) {
			if( reg.service === service ) {
				const org = (await Organization.get( reg.org, user )) || (await Organization.new( reg.org, user ));
				console.log( "Got org...")
				const dom = await org.getDomain( domain, user );
				console.log( "got domain...", dom );
				const newSrvc = new Service().set( dom, service, user );
				UserDb.on( "newService", newSrvc );
				//console.log( "----------------------------------------- SERVICE STORE HERE -------------------------------------" );
				newSrvc.store();
				dom.services.push( newSrvc );
				dom.store();			
				
				const badges = newSrvc.makeBadges( reg.badges, user );
				
				const inst = newSrvc.addInstance( regPending.ws );

				// resolve the registration
				regPending.p.then( (a)=>{
					console.log( "Service has been notified of it's SID, this can now tell it to expec this user?")
					return a;
				})
				regPending.res( newSrvc );
				console.log( "This service has gotten a reply for their identity and is no longer 'registrations'");
				l.registrations.splice( r, 1 );

				//console.log( 'authorize...', svc, stringifier.stringify( org ) );
				// radio the service ahead of time, allowing the service to setup for the user
				// gets back a connection token and address...
				//const redirect = svc.authorize( forUser );
				return newSrvc;
			}
		}
	}

}

export class Domain  extends StoredObject{
	domainId = null;
	#org = null;
	name = null;
	createdBy = null;
	services = []; // services this domain has available.
	#registrations = [];
	constructor( ) {
		super( l.storage );
	}

	set( org, name, forUser ) {
		this.#org = org;
		if( name ) {
			this.domainId = sack.Id();
			this.name = name;
			if( !forUser ) throw new Error( "Need a user" );
			this.createdBy = forUser;
		}
		return this;
	}
	get org() {
		return this.#org;
	}
	async store() {
		await super.store();
		await l.domains.set( this.name, this ); 
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

	async addService( msg ){
		const reg = { p:null, res:null,rej:null,msg:msg };
		reg.p = new Promise( (res,rej)=>{
			reg.res = res; reg.rej=rej;
		} );
		this.#registrations.push( reg );
		return reg.p;
	}

	async getService( name, forUser ) {
		let promises = [];
		let resolved = false;
		
		const srvc = await new Promise( async (res,rej)=>{
			//console.log( "---------------------------- GETTING SERVICE FROM DOMAIN:", name, forUser, this );
			const registering = l.registrations.find( async service=>{
				//console.trace( "Looking at pending regirations...", service.msg, service.msg.service, name );
				//const org = await Organization.get( service.org );
				//if( !org ) return defer(0);
				//const dmn = await org.getDomain( service.domain );
				//if( !dmn ) return defer(1);
				if( service.msg.description === name ) return true;
				return false;
	
			} );

			debug_ && console.log( "looking at this services list...", this.services, registering )
			const srvc = this.services.find( (srvc,idx)=>{
				if( srvc instanceof Promise ) {
					srvc.then( (srvc)=>{
						if( srvc.name === name ){
							//if( !srvc.)
							resolved = true;
							res( srvc );
						}
					})
					promises.push( srvc );
					l.storage.map( srvc );
					return false;
				}
				debug_ && console.log( "srvc there can never be a promise?");
				return( srvc.name===name );
			} );
			debug_ && console.log( "domain.getservice result(reload not null, wait to create is undefined or null?)"
				, name, srvc, this.services );
			if( !srvc ) {
				if( !promises.length) {
					// don't allow guests to create services.
					//console.log( "Create new service is by guest?", forUser );
					if( forUser && (!config.allowGuestServices) && forUser.guest ) {
						res( null );
						return;
					}
					if( forUser )
						await createInitialDomain( this.name, name, forUser );
					// not pending, not known, now what?
					res( null );
				}
				else Promise.all( promises ).then( ()=>{
					if( !resolved ) rej();					 
				});
			}else {
				console.log( "Should have free and active:", srvc.free, srvc.active)
				res( srvc );
			}
		} );
		return srvc;				
	}

	static async get( name, forClient ) {
	}
	
}


