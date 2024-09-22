import {sack} from "sack.vfs"
const JSOX = sack.JSOX;
const StoredObject = sack.ObjectStorage.StoredObject;

import {Badge} from "./Badge.mjs"
import {Sash} from "./Sash.mjs"
import {l} from "../userDb.mjs"

export class StoredService{
	srvc = new Service();
	domain = null;
}


/**
 * This is a connected instance of a service.  It is initialized blank, and is set
 * by external information.
 */
export class ServiceInstance {
	sid = null;
	#service = null;
	//#connections = [];
	#ws = null;  // one connection per instance
	constructor() { }
	get service() {
		return this.#service;
	}
	get ws() {
		return this.#ws;
	}
	set service( s ) {
		if( s ) {
			if( !this.#service ) 
				this.#service = s;
			else {
				throw new Error( "Service is already connected" );
			}
		}else
			this.#service = s;
	}
	async authorize( rid, forUser ) {
		if( !this.#ws ) {
			console.trace( "Chose a disconnected instance to try");
			return;
		}
		console.trace( "Authorize service....", !!this.#ws, !!forUser );
		const inst = this;
		//console.log( "inst:", inst, forUser );
		//console.log( "have to send something to a instance ...., to get it to accept, and get user info" );
		//console.log( "permissions:", permissions );

		if( forUser ) {
			const permissions = await forUser.getSash( this.#service.domain );
			const id = sack.Id();
			const msg = { op:"expect", id:id, name:forUser.name, sash:permissions, UID: sack.id(forUser.userId+"@"+this.#service.domain) };
			inst.send( msg );
			
			return new Promise( (res,rej)=>{
				l.authorizing.set( id, {res:res,rej:rej, rid:rid } );
			} );
		}
	}
	set( sid ){
		console.trace( "Set Service Instance SID:", sid);
		const oldSid = this.sid;
		this.sid = sid || sack.Id();
		//console.log( "Setting ID:", oldSid, this.sid );
		//console.trace( "New ID", this.sid);
		this.#service.setInstance( oldSid, this.sid );
		return this;
	}
	send(msg) {
		if( !this.#ws ) {
			console.trace( "This instance is closed, why using this one?", msg )
			return;
		}
		if( "string" !== typeof msg ) msg = JSOX.stringify( msg );
		console.trace( "asdf", msg );
		if( this.#ws.readyState === 1 )
			this.#ws.send(msg);
		else console.trace( " tried to send to a closed socket..." );
	}
	connect( ws ) {
		// being allocated/connected in a service so it's not set yet
		//if( this.#service )
		//	this.#service.setInstance( this.sid, sid );
		//if( this.sid && sid !== this.sid ) console.log( "DIfferent SID", sid, this.sid );
		//this.sid = sid;
		//console.trace( "Setting websocket:", ws );
		if( this.#ws && this.#ws !== ws ) {
			console.log( "This should probably be a fatal error, but it can be that a service restarts and doesn't notify the host properly..." );
			this.#ws.close( 1000, "Connection replaced with yourself" );
		}
		//console.log( "This service instance is now connected this this socket:", ws );
		this.#ws = ws;
		this.#ws.on( "close", (a,b)=>{
			console.log( "Hope this doesn't steam the close event...");
			this.#ws = null; // this isntance is no longer presnet
		})
		//console.trace( "---- Finally finish the connection for ws->inst tracking");
		if( ws.readyState == 1 ) {
			console.trace( "SEN register herer from server once with ok true (in connect(ws))");
			ws.send( JSOX.stringify( { op:"register", ok:true, sid: this.sid } ) );
		}else
			console.trace( "This is a closed socket, why is it being connected?" );
		return;
	}

}

export function serviceToJSOX(stringifier) {
	const keys = Object.keys( this );
	//keys.push( "id" );
	const mirror = {domain : this.domain};
	for( let key of keys ) mirror[key] = this[key];
	const r = stringifier.stringify( mirror );
	//console.trace( " ------------- Stringify will mirror:", mirror, "from", this );
	//console.log( " --- BECAME:", r );
	return r;
}

export class Service  extends StoredObject{
	svcId = null;
	name = null;
	createdBy = null;
	//members = new SlabArray( l.storage );
	masterSash = null;
	defaultSash = null;//new Sash();
	instances = []; // allocated service identifiers
	#free_instances = []; // initially, all istances (by ID)...
	#unused_instances = []; // free instances that are ServiceInstance...
	#active_instances = []; // active service instances (instances of ServiceInstance)
	#domain = null;
	#instances = []; // actively tracked services... 
	constructor() {
		super( l.storage );
	}
	get free() {
		return this.#free_instances;
	}
	get unused() {
		return this.#unused_instances;
	}
	get active() {
		return this.#active_instances;
	}
	
	set( domain, name, forUser ) {
		this.#domain = domain;
		if( name ) {			
			console.log( "This is creating a new sash; so it is able to set the service : USER?", forUser )
			this.masterSash = new Sash().set( this, "Master:" +name+"@"+domain.name, true );
			this.defaultSash = new Sash().set( this, "Default:" +name+"@"+domain.name );
			this.createdBy = forUser;
			this.name = name;
			this.serviceId = sack.Id();
			this.store();
			this.masterSash.store();
			this.defaultSash.store();
		}
		return this;
	}
	async store() {
		return await super.store();
		// already tracked in a domain.
		//await l.services.set( this.name, this ); 
		//for( n = 0; 
	}
	get domain() {
		return this.#domain;
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

	async authorize( forUser ) {
		const i = Math.floor(Math.random()*this.#active_instances.length);
		if( this.#active_instances.length > i ) {
			const inst = this.#active_instances[i];
			console.log( "picking up a authorized instance for user", forUser, inst );
			return inst.authorize( forUser );
		}
	}

	getConnectedInstance( ) {
		//console.trace( "Okay this has to look at pending, and connected instances");
		const i = Math.floor(Math.random()*this.#active_instances.length);
		console.log( "active instances(some aren't active!):", this.#active_instances );
		if( this.#active_instances.length > i ) {
			const inst = this.#active_instances[i];
			//console.log( "Found an active instance to return:", inst );
			return inst;//.authorize( forUser );
		}
		{
			console.log( "Other instances?", this.#instances, this.#active_instances );
		}
	}

	getServiceInstance( sid ) {
		//console.trace( "Getting instance:", sid );
		if( !sid ) {
			console.log( "Just getting any instance.... (overlapped function)")
			if( !this.#instances.length ) {
				console.log( "Nothing to choose.... while this is a path we're already live");
			}
			// return one of the instances of this service.
			const i = Math.floor(Math.random()*this.#instances.length);
			const inst = this.#instances[i];
			console.log( "Probably returned nothing?", inst );
			return inst;
		} else {
			console.trace( "this has instances?", this.instances, this.#instances );
			for( let i = 0; i < this.instances.length; i++ ) {
			//for( let inst of this.instances ) {
				const inst = this.instances[i];
				//console.log( "Found match?" , inst, sid );
				if( inst === sid ) {
					//console.log( "Found match?" );
					if( this.#instances[i]){
						console.log( "service is already connected, fault");
						return this.#instances[i];
					}else {
						const inst = new ServiceInstance( );
						inst.service = this;
						//console.log( "create active service instance with websocket");
						inst.set( sid );//.connect( ws );  connect is handled when this returns...
						// this.instances already has this.
						//this.instances.push( inst.sid );
						console.log( "This is adding an instance to active instances (from free?)");
						this.#active_instances.push(inst );
						this.#instances.push( inst );
						//this.store();
						return inst;
					}
				} 
			}
			console.log( "Fatality; requested service ID does not already exist..." );
		}
	}

	addInstance(ws) {
		if( !ws ) throw new Error( "Instances need a socket." );

		let inst = null;
		//console.trace( "ADDING A INSTANCE for socket:", ws );
		if( this.#unused_instances.length ) {
			inst = this.#unused_instances.pop();
			this.#active_instances.push( inst );
		} else if( this.#free_instances.length ) {
			inst = new ServiceInstance( );
			inst.service = this;
			const newinst = this.#free_instances.pop();
			inst.set( newinst );
			console.log( "Found a free instance to use for this...", newinst );
		}else {
			inst = new ServiceInstance( );
			inst.service = this;
			inst.set();
			this.instances.push( inst.sid );
		}

		ws.onclose = (code,reason)=>{
			console.log( "Onclose now removes active instances...", ws, );
			for( let n = 0; n < this.#active_instances.length; n++ ) {
				if( this.#active_instances[n].ws === ws ) {
					console.log( "did find a instance to grab..", this.#free_instances );
					this.#unused_instances.push( this.#active_instances[n] );
					this.#active_instances.splice( n, 1 );
					break;
				}
			}
		};
		inst.connect( ws );
		console.log( "and instance should be added to active instances");
		this.#active_instances.push(inst );
		this.#instances.push( inst );
		this.store();
		return inst;
	}

	setInstance( oldsid, sid )
	{
		if( oldsid ) {
			const oldid = this.instances.findIndex( n=>n===oldsid );
			if( oldid >= 0 ) {
				this.instances[oldid]=sid;
			}		
			else {
				throw new Error( "Failed to find old ID");
			}
		}
	}

	async makeBadges( badges, forUser ) {
		if( this.masterSash.badges.length ){
			const sash = this.masterSash;//await forUser.getSash( this.#domain.org.name );
			let adds = 0;
			for( let badge in badges ) {
				if( !sash.getBadge( badge ) ) {
					const badgeData = badges[badge];
					adds++;
					const newBadge = new Badge().set( this, badge, badgeData.name, badgeData.description );
					sash.addBadge( newBadge );
				}
			}

			if( adds ) sash.store();
			
		}else {
			const sash = this.masterSash;//await forUser.getSash( this.#domain.org.name );
			for( let badge in badges ) {
				const badgeData = badges[badge];
				const newBadge = new Badge().set( this, badge, badgeData.name, badgeData.description );
				sash.addBadge( newBadge );
			}
			const userSash = sash.clone( new Sash() );

			forUser.addSash( userSash );

			sash.store();
			userSash.store();
		}
	}
	static serviceFromJSOX(field,val) {
		//console.log( "Setting Service Field:", this, field, val );
		try {
			if( !field ) {
				// finalize object initialization.
				// all existing are now free...
				this.srvc.#free_instances = this.instances.slice();
				//console.log( "reloaded? fix sashes?", this )
				return this.srvc;
			}
			// possible redirection of arrays and members...
			if( field === "domain" ) this.srvc.set( val );
			else if( field === "instances" ) {
				return this.srvc[field]=val;
			}
			else this.srvc[field] = val;
			return undefined;
		} catch(err) { console.log( "SERVICE FAULT:", err ) }
	}
}

