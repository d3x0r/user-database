import {sack} from "sack.vfs"
const JSOX = sack.JSOX;

import {Badge} from "./Badge.mjs"
import {Sash} from "./Sash.mjs"
import {l,StoredObject,settle} from "../userDb.mjs"

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
		//console.log( "get ws(), This.#ws isn't right?", this.#ws );
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

		//console.trace( "Authorize service....", !!this.#ws, !!forUser );
		const inst = this;
		//console.log( "inst:", inst, forUser );
		//console.log( "have to send something to a instance ...., to get it to accept, and get user info" );
		//console.log( "permissions:", permissions );

		if( forUser ) {
			const permissions = await forUser.getSash( this.#service.domain );
			const id = sack.Id();
			const msg = { op:"expect", id:id, name:forUser.name, sash:permissions, UID: sack.id(forUser.userId+"@"+this.#service.domain) };
			// a service hosted by this same process (profile, admin) can recover the real
			// User from the UID when its expect handler runs; remote services only get the UID.
			l.expectedUsers.set( msg.UID, forUser );
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
		//console.trace( "asdf", msg );
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
		//console.trace( "Setting websocket on connect? (client?):", ws );
		if( this.#ws && this.#ws !== ws ) {
			console.log( "This should probably be a fatal error, but it can be that a service restarts and doesn't notify the host properly..." );
			this.#ws.close( 1000, "Connection replaced with yourself" );
		}
		//console.log( "This service instance is now connected this this socket:", ws );
		this.#ws = ws;
		this.#ws.on( "close", (a,b)=>{
			console.trace( "Service... Hope this doesn't steal the close event...", a, b, this.#ws);
			this.#ws = null; // this isntance is no longer presnet
		})
		//console.trace( "---- Finally finish the connection for ws->inst tracking");
		if( ws.readyState == 1 ) {
			console.trace( "SEND register here from server once with ok true (in connect(ws))");
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

// One in-memory Service per serviceId.  The object store can revive the same record
// through two load paths (service registration vs. a user's sash) as two objects, and
// whichever stores last overwrites the other's changes; keep a single instance instead.
const serviceRegistry = new Map();
export function sameService( a, b ) {
	if( !a || !b ) return false;
	if( a === b ) return true;
	const ida = a.serviceId || ( a.srvc && a.srvc.serviceId );
	const idb = b.serviceId || ( b.srvc && b.srvc.serviceId );
	return !!ida && ida === idb;
}
export function domainName( d ) {
	if( !d ) return null;
	if( "string" === typeof d ) return d;
	return d.name || ( d.domain && d.domain.name ) || null;
}

export class Service  extends StoredObject{
	svcId = null;
	name = null;
	createdBy = null;
	//members = new SlabArray( l.storage );
	masterSash = null;
	defaultSash = null;//new Sash();
	sashes = []; // sashes defined for this service besides master/default (stored with the service)
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
			serviceRegistry.set( this.serviceId, this );
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
			inst.set( inst.sid );
			this.instances.push( inst.sid );
		}

		ws.onclose = (code,reason)=>{
			//console.log( "Onclose now removes active instances...", ws, );
			for( let n = 0; n < this.#active_instances.length; n++ ) {
				if( this.#active_instances[n].ws === ws ) {
					//console.log( "did find a instance to grab..", this.#free_instances );
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

	// ---- sash management (used by the profile service) ------------------------------
	static settle( v ) { return settle( v ); }
	async allSashes() {
		const unwrap = ( x )=>( x && x.sash && !( "badges" in x ) ) ? x.sash : x;
		const isSash = ( x )=>x && "function" === typeof x.for;
		this.masterSash = unwrap( await Service.settle( this.masterSash ) );
		this.defaultSash = unwrap( await Service.settle( this.defaultSash ) );
		if( !( this.sashes instanceof Array ) ) this.sashes = [];
		for( let i = 0; i < this.sashes.length; i++ ) this.sashes[i] = unwrap( await Service.settle( this.sashes[i] ) );
		// older records stored the default sash as an empty object; rebuild it
		if( !isSash( this.defaultSash ) ) {
			const dom = this.#domain && ( this.#domain.name || ( this.#domain.domain && this.#domain.domain.name ) );
			this.defaultSash = new Sash().set( this, "Default:" + this.name + "@" + dom );
			await this.store();
		}
		const list = [];
		if( isSash( this.masterSash ) ) list.push( this.masterSash );
		if( isSash( this.defaultSash ) ) list.push( this.defaultSash );
		for( const sash of this.sashes ) if( isSash( sash ) ) list.push( sash );
		for( const sash of list ) if( !( sash.badges instanceof Array ) ) sash.badges = [];
		for( const sash of list )
			for( let i = 0; i < sash.badges.length; i++ ) sash.badges[i] = await Service.settle( sash.badges[i] );
		return list;
	}
	async getSashByName( name ) {
		return ( await this.allSashes() ).find( ( sash )=>sash.name === name ) || null;
	}
	// wearers of the master sash, or of any sash carrying the "edit" badge, manage sashes
	async canManage( sash ) {
		sash = await Service.settle( sash );
		if( !sash ) return false;
		if( sash.master ) return true;
		for( let badge of sash.badges ) { badge = await Service.settle( badge ); if( badge && badge.tag === "edit" ) return true; }
		return false;
	}
	async createSash( name ) {
		name = String( name || "" ).trim();
		if( name.length < 2 ) throw new Error( "Sash name is too short." );
		if( await this.getSashByName( name ) ) throw new Error( "A sash named " + name + " already exists for this service." );
		const sash = new Sash().set( this, name );
		sash.sashId = sack.Id();
		this.sashes.push( sash );
		await sash.store();
		await this.store();
		return sash;
	}
	async setSashBadges( sash, tags ) {
		sash = await Service.settle( sash );
		if( !sash ) throw new Error( "No such sash." );
		if( sash.master ) throw new Error( "The master sash always carries every badge." );
		const master = await Service.settle( this.masterSash );
		for( let i = 0; i < master.badges.length; i++ ) master.badges[i] = await Service.settle( master.badges[i] );
		const next = [];
		for( const tag of ( tags || [] ) ) {
			const badge = master.getBadge( tag );
			if( !badge ) throw new Error( "This service has no badge tagged " + tag + "." );
			if( !next.includes( badge ) ) next.push( badge );
		}
		sash.badges = next;
		await sash.store();
		return sash;
	}

	// A service registering again (restart, or a badge file that appeared after the
	// service was first created) may declare badges the master sash doesn't have yet.
	// Add the missing ones; existing badges and user sashes are left alone.
	async syncBadges( badges ) {
		if( !badges || "object" !== typeof badges ) return 0;
		let sash = this.masterSash;
		sash = this.masterSash = await settle( sash );
		if( !sash ) return 0;
		for( let i = 0; i < sash.badges.length; i++ )
			sash.badges[i] = await settle( sash.badges[i] );
		let adds = 0;
		for( const tag in badges ) {
			if( sash.getBadge( tag ) ) continue;
			const badgeData = badges[tag] || {};
			sash.addBadge( new Badge().set( this, tag, badgeData.name || tag, badgeData.description ) );
			adds++;
		}
		if( adds ) {
			console.log( "Service", this.name, "gained", adds, "badge(s) from its registration" );
			await sash.store();
		}
		return adds;
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
				const id = this.srvc.serviceId;
				const existing = id && serviceRegistry.get( id );
				if( existing && existing !== this.srvc ) {
					// already live in this process; hand back that one so edits don't fork
					return existing;
				}
				if( id ) serviceRegistry.set( id, this.srvc );
				// all existing are now free...
				this.srvc.#free_instances = this.instances.slice();
				//console.log( "reloaded? fix sashes?", this )
				return this.srvc;
			}
			// A field reviver must return the value it kept: an array of ~or references
			// revives EMPTY when the reviver returns undefined (the store only fixes up
			// references inside values the reviver handed back).  `sashes` was lost that way.
			if( field === "domain" ) { this.srvc.set( val ); return val; }
			return this.srvc[field] = val;
		} catch(err) { console.log( "SERVICE FAULT:", err ) }
	}
}

