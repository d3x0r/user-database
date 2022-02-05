                                                        
import {sack} from "sack.vfs"
const JSOX=sack.JSOX;
const stringifier = JSOX.stringifier();

import {BloomNHash} from "@d3x0r/bloomnhash"
import {SlabArray}  from "@d3x0r/slab-array"

const StoredObject = sack.ObjectStorage.StoredObject;
//import {StoredObject} from "../commonDb.mjs"


let inited = false;
let initResolve = null;

const configObject = {
	accountId : null,
	nameId : null,
	emailId : null,
	reconnectId : null,
	clientId : null,
	orgId : null,
	domainId : null,
	actAs : null,
	actIn : null,
	actBy : null,
};

const l = {
	ids : configObject,
	account   : null,
	name      : null,
	email     : null,
	reconnect : null,
	clients : null,
	orgs : null,
	domains : null,
	actAs : null, // relates user ids that user can act As (inhertis rights of act-as )
	actIn : null, // relates user ids that user belong to (inherit all rights of in)
	actBy : null, // relates user ids that a user can be enacted by
	storage : null,
	authorizing : new Map(),
	registrations : [], // these are for orgs that do not exist yet... waiting for someone to ask for it.
};


let initializing = new Promise( (res,rej)=>{
	initResolve = res;
	if( l.storage ) {
		res();
		console.log( "Already initalized before...." );
	}
} ).then( ()=>{
	inited = true;
} );

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -


export class UniqueIdentifier extends StoredObject {
	key = null;
	created = new Date();
	constructor() {
		super(l.storage);
	}
	addUser( user,account,email,pass ){
		//if( "string" !== typeof pass ) throw new Error( "Please pass a string as a password" );
		const newUser = new User();
		newUser.hook( this );
		newUser.account = ''+account;
		newUser.name = ''+user;
		newUser.email = ''+email;
		newUser.pass = ''+pass;
		newUser.unique = this;
		newUser.store();
		return newUser;
	}
}

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -


class StoredSash{
	service = null;
	sash = new Sash(); // the real result
}

function sashToJSOX(stringifier) {
	const keys = Object.keys( this );
	//keys.push( "id" );
	const mirror = {service : this.service};
	for( let key of keys ) mirror[key] = this[key];
	//console.trace( " ------------  SASH  ----------- Stringify sash mirror:", mirror );
	const r = stringifier.stringify( mirror );
	//console.log( " --- BECAME:", r );
	return r;
	
}

function sashFromJSOX(field,val) {
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
		console.trace( "WHO IS SAVING A SASH SO EARLY?" );
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

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

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

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -


class StoredOrganization{
	orgId = null;
	name = null;
	createdBy = null;
	domains = [];
	org = new Organization();
	constructor() {

	}
}

function orgFromJSOX(field,val) {
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

}

Organization.get = async function ( name, forClient ) {
	const org = l.orgs.get( name );
	if( !org && forClient ){
		const org = await Organization.new( name, forClient );
		return org;
	}
	return org;
}



Organization.new = async function ( name, forUser ) {
	if( !(forUser instanceof User ) ) throw new Error( "Required object User incorrect." + JSOX.strinigfy(forUser ) );
	console.log( "Creating Org" );
	const org = new Organization();
	org.name = name;
	org.createdBy = forUser;
	org.orgId = sack.Id();

	return org.store().then( (id)=>org );
}


// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

class StoredDomain extends StoredObject {
	domain = new Domain();
}

function domainFromJSOX(field,val) {
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
		let foundSrvc = null;
		//console.log( "---------------------------- GETTING SERVICE FROM DOMAIN:", name, forUser, this );
		const srvc = this.services.find( async (srvc,idx)=>{
			if( srvc instanceof Promise ) {
				promises.push( srvc );
				srvc = await l.storage.map( srvc );
				console.log( "does map result with the service?", srvc );
				//srvc = this.services[idx];
				if( srvc.name === name ) {
					foundSrvc = srvc;
				}
				return false;
			}
			return( srvc.name===name );
		} );
		//console.log( "domain.getservice result blah (reload not null, create is null?)", srvc );
		if( !srvc ) {
			if( !promises.length) {
				// don't allow guests to create services.
				if( forUser.guest ) return null;

				const newSrvc = new Service().set( this, name, forUser );
				UserDb.on( "newService", newSrvc );
				//console.log( "----------------------------------------- SERVICE STORE HERE -------------------------------------" );
				newSrvc.store();
				this.services.push( newSrvc );
				this.store();			
				return newSrvc;
			}
			return Promise.all( promises ).then( ()=>foundSrvc );
		}

		return srvc;				
	}
}

Domain.get = async function( name, forClient ) {
}

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

class StoredService{
	srvc = new Service();
	domain = null;
}

function serviceFromJSOX(field,val) {
	//console.log( "Setting Servce Field:", field, val );
		try {
	if( !field ) {
		if(0) // thisshould only happen when a instance connects; otherwise no tracking info needed.
		for( let sid of this.srvc.instances ) {
			// rebuild service instances.
			const inst = new ServiceInstance();
			inst.sid = sid;
			inst.service = this;
			this.srvc.addInstance_( inst );
		}
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

class ServiceInstance {
	sid = null;
	#service = null;
	//#connections = [];
	#ws = null;  // one connection per instance
	constructor() { }
	get service() {
		return this.#service;
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
		const inst = this;
		//console.log( "inst:", inst, forUser );
		//console.log( "have to send something to a instance ...., to get it to accept, and get user info" );
		const permissions = await forUser.getSash( this.#service.domain );
		//console.log( "permissions:", permissions );

		const id = sack.Id();
		
		const msg = { op:"expect", id:id, name:forUser.name, sash:permissions, UID: sack.id(forUser.userId+"@"+this.#service.domain) };
		inst.send( msg );
		
		return new Promise( (res,rej)=>{
			l.authorizing.set( id, {res:res,rej:rej, rid:rid } );
		} );

	}
	set( sid ){
		const oldSid = this.sid;
		this.sid = sid || sack.Id();
		//console.log( "Setting ID:", oldSid, this.sid );
		//console.trace( "New ID", this.sid);
		this.#service.setInstance( oldSid, this.sid );
		return this;
	}
	send(msg) {
		if( "string" !== typeof msg ) msg = JSOX.stringify( msg );
		console.log( "asdf", msg );
		this.#ws.send(msg);
	}
	connect( ws ) {
		// being allocated/connected in a service so it's not set yet
		//if( this.#service )
		//	this.#service.setInstance( this.sid, sid );
		//if( this.sid && sid !== this.sid ) console.log( "DIfferent SID", sid, this.sid );
		//this.sid = sid;
		//console.trace( "Setting websocket:", ws );
		if( this.#ws ) {
			console.log( "This should probably be a fatal error, but it can be that a service restarts and doesn't notify the host properly..." );
			this.#ws.close( 1000, "Connection replaced with yourself" );
		}

		this.#ws = ws;
		//console.trace( "---- Finally finish the connection for ws->inst tracking");
		ws.send( JSOX.stringify( { op:"register", ok:true, sid: this.sid } ) );
		return;
	}
}

function serviceToJSOX(stringifier) {
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
	#active_instances = []; // allocated service identifiers
	#domain = null;
	#instances = []; // actively tracked services... 
	constructor() {
		super( l.storage );
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
	loaded( a, b ) {
	
		super.loaded(a,b);
		console.log( "reloaded? fix sashes?", this )
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
			return inst.authorize( forUser );
		}
	}

	getConnectedInstance( ) {
		//console.trace( "Okay this has to look at pending, and connected instances");
		const i = Math.floor(Math.random()*this.#active_instances.length);
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
		console.trace( "Getting instance:", sid );
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
			//console.log( "this has instances?", this.instances, this.#instances );
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
		console.trace( "ADDING A INSTANCE for socket:", ws );
		const inst = new ServiceInstance( );
		inst.service = this;
		inst.set().connect( ws );
		this.instances.push( inst.sid );
		this.#active_instances.push(inst );
		this.#instances.push( inst );
		this.store();
		return inst;
	}

	addInstance_( inst ) {
		this.#instances.push( inst );
	}
	setInstance( oldsid, sid )
	{
		if( oldsid ) {
			const oldid = this.instances.find( n=>n===oldsid );
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
}




export class User  extends StoredObject{
	userId = null; 
	unique = null;
	account = null;
	name = null;
	email = null;
	pass = null;
	guest = true;
	devices = [];
	sashes = []; 
	created = new Date();
	
	constructor() {
		super(l.storage);
		this.userId = sack.Id();
	}
	set authorize(val) {
		this.guest = false;
		this.store();
	}
	store() {
		return super.store().then( async (id)=>{	
			//console.log( "what about?", id, l );
			//console.log( "Setting account to:", this.account, this );
			await l.account.set( this.account, this );
			await l.name.set( this.name, this );
			//console.log( "Account was set" );
			await l.email.set( this.email, this );
			//console.log( "email was indexed" );
			return this;
		} );
	}
	addDevice( id, active ) {
		const device = new Device();
		device.hook( this )
		device.key = id;
		device.active = active;
		return device.store().then( ()=>
			(this.devices.push(device ),this.store(),device) );
	}
	async getDevice( id ) {
		return new Promise( (res,rej)=>{
			let results = 0;
			//console.trace( "Trying to find:", id, "in", this.devices );
			for( let device of this.devices ) {
				if( device instanceof Promise ) {
					//console.log( "device needs to be loaded..." );
					results++;
					device.then( (dev)=>{
						if( results >= 0 ) {
							if( dev.key === id ){
								device.accessed = new Date();
								device.store();
								res( device );
								if( results > 1 )
									results = -1; 
								return;
							}
							results--;
							if( results === 0 ) {
								//console.log( "nothing more to load..." );
								res( null );
							}
						}
					} );
					this.storage.map( device );
				}
				else  {
					if( device.key === id ) {
						results = -1; // make sure nothing else checks.
						device.access = new Date();
						device.store();
						res( device );
						return;
					}
				}
			}
                        if( results === 0 ) res( null );
		});
	}
	addSash( sash ) {
		console.log( "Add sash to user:", this, sash );
		this.sashes.push( sash );
		this.store();
	}

	async getSash( domain ) {
		if( this.guest ) return { guest:true };
		const badges = {};
		const found = [];
		let s = 0;
		for( ; s < this.sashes.length; s++ ) {
			const sash = this.sashes[s];
			console.log( "Sash is incomplete?", sash, sash.service, sash.service.domain )
			if( sash.for( domain ) )
				found.push(sash);
		} ;
		let sash = null;
		console.log( "Found?", found, this, this.sashses, domain );
		if( !found.length ) {
			
		}
		if( found.length > 1 ) {
			// ask user to select a sash to wear.
			sash = await UserDb.on( "pickSash", this, found );
			
		}else sash = found[0];
		if( sash )
		for( let badge of sash.badges ) {
			badges[badge.tag] = true;
		} 
		return badges;
	}
}

User.get = async function( account ) {
	// account should be a string, but get/set on bloomnhas will handle strings
	const t = typeof account; if( t !== "number" && t!=="string" ) throw new Error( "Unsupported key type passed:" +  t + ":"+account );
	//console.log( "lookingup", typeof account, account );
	if( !account ) {
		return Promise.resolve(null);//throw new Error( "Account must be specified");
	}
	//console.log( "l?", JSOX.stringify(l.account,null,"\t"), account );
	const user1 = await l.account.get( account );
	if( !user1 )  {
		return l.name.get( account );
	}
	return user1;

}

User.getEmail = function( email ) {
	if( email && email === "" ) return null; // all NULL email addresses are allowed.
	//console.log( "l?", l.email, email );
	return l.email.get( email );
}


// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

export class Device  extends StoredObject{
	key = null;
	active = false;
	added = new Date();
	accessed = new Date();
	constructor() {
		super(l.storage);
	}
}

let getUser = null;
let getIdentifier = null;

async function userActsAs( user, act ) {
	const active = l.actAs.get( user );
	if( active ) {
		active.push( act );
	}else {
		const array = new SlabArray(l.actAs.storage);
		array.push( active );
		l.actAs.set( user, array )
	}
	
	const users = l.actBy.get( act );
	if(users )
		users.push( user );
	else {
		const array = new SlabArray(l.actAs.storage);
		array.push( user );
		l.actBy.set( act, array )
	}

}

async function userActsIn( user, group ) {
	const active = l.actIn.get( group );
	if( active ) {
		active.push( group );
	}else {
		const array = new SlabArray(l.actAs.storage);
		array.push( user );
		l.actIn.set( user, [ group ] )
	}


}

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

const encoders = [ 
	  { tag:  "~U", p:User, f: null }
	, { tag:  "~D", p:Device, f: null }
	, { tag:  "~I", p:UniqueIdentifier, f: null } 
	, { tag:  "~O", p:Organization, f: null }
	, { tag: "~Dm", p:Domain, f: null }
	, { tag:"~Svc", p:Service, f: serviceToJSOX }
	, { tag:"~SvI", p:ServiceInstance, f:null }
	, { tag:"~Ssh", p:Sash, f:sashToJSOX  }
	, { tag:  "~B", p:Badge, f:null  }
];

const eventMap = {};

const UserDb = {
	async hook( storage ) {
		l.storage = storage;
		BloomNHash.hook( storage );
		
		//jsox.fromJSOX( "~T", TextureMsg, buildTexturefromJSOX );
		encoders.forEach( e=>stringifier.toJSOX( e.tag, e.p, e.f ) );

		storage.addEncoders( encoders );
		storage.addDecoders( [ { tag:"~U", p:User, f: null }
			, { tag:  "~D", p:Device, f: null }
			, { tag:  "~I", p:UniqueIdentifier, f: null } 
			, { tag:  "~O", p:StoredOrganization, f: orgFromJSOX }
			, { tag: "~Dm", p:StoredDomain, f: domainFromJSOX }
			, { tag:"~Svc", p:StoredService, f: serviceFromJSOX }
			, { tag:"~SvI", p:ServiceInstance, f:null }
			, { tag:"~Ssh", p:StoredSash, f:sashFromJSOX  }
			, { tag:  "~B", p:Badge, f:null  }
	 	] );

		getUser = (id)=>{
			return User.get( id );
		};
		getIdentifier = ()=>{
			const unique = new UniqueIdentifier();
			unique.key = sack.Id();
			unique.hook( storage );
			return unique;
		}
		const root = await storage.getRoot();
		if( root.find( "userdb.config.jsox" ) ) {
			//console.log( "Test:", root.exists( "userdb.config.jsox" ) );
			const file = await root.open( "userdb.config.jsox" )
			const obj = await file.read()
			Object.assign( l.ids, obj );
                        
			l.clients   = await storage.get( l.ids.clientId );
			l.email     = await storage.get( l.ids.emailId );
			l.email.caseInsensitive = true;
			l.account   = await storage.get( l.ids.accountId );
			l.account.caseInsensitive = true;
			if( l.ids.nameId) 
				l.name      = await storage.get( l.ids.nameId );
			else {
				l.name      = new BloomNHash();
				l.name.hook( storage );
				l.ids.nameId      = await l.name.store();
			}
			l.name.caseInsensitive = true;
			l.reconnect = await storage.get( l.ids.reconnectId );

			l.orgs      = await storage.get( l.ids.orgId );
			l.orgs.caseInsensitive = true;
			l.domains   = await storage.get( l.ids.domainId );
			l.domains.caseInsensitive = true;

		} else {
			//console.log( "User Db Config ERR:", err );
			const file = await root.create( "userdb.config.jsox" );
			
			l.clients   = new BloomNHash();
			l.clients.hook( storage );
			l.account   = new BloomNHash();
			l.account.caseInsensitive = true;
			l.account.hook( storage );
			l.name      = new BloomNHash();
			l.name.caseInsensitive = true;
			l.name.hook( storage );
			l.email     = new BloomNHash();
			l.email.caseInsensitive = true;
			l.email.hook( storage );
			l.reconnect = new BloomNHash();
			l.reconnect.hook( storage );

			l.domains = new BloomNHash();
			l.domains.caseInsensitive = true;
			l.domains.hook( storage );
			l.orgs    = new BloomNHash();
			l.orgs.caseInsensitive = true;
			l.orgs.hook( storage );

			l.ids.clientId    = await l.clients.store();
			l.ids.accountId   = await l.account.store();
			l.ids.nameId      = await l.name.store();
			l.ids.emailId     = await l.email.store();
			l.ids.reconnectId = await l.reconnect.store();
			l.ids.orgId       = await l.orgs.store();
			l.ids.domainId    = await l.domains.store();
			//console.log( "Write?", l.ids );
			file.write( l.ids );
		}
                	if( initResolve )
	                	initResolve();
		else console.log( "Init never resolves...." );
	},
	on( event, data ) {
		if( "function" === typeof data ) {
			let a = eventMap[event];
			if( !a ) a = eventMap[event] = [];
			a.push( data );
		} else {
			const a = eventMap[event];
			if( a ) for( let f of a ) f( data );
		}
	},
	off( event, f ) {
		console.log( "disabling events not enabled" );
	},
	get stringifier() {
		const stringifier = JSOX.stringifier();
		encoders.forEach( e=>stringifier.toJSOX( e.tag, e.p, e.f ) );
		return stringifier;
	},
	getUser(args){
		return getUser(args);
	},
	async isEmailUsed( email ) {
		// this is just used for a check 'if used'
		return !(await l.email.get( email ));
	},
	async isNameUsed( name ) {
		// this is just used for a check 'if used'
		return !!(await l.name.get( name ));
	},
	async isAccountUsed( account ) {
		// this is just used for a check 'if used'
		return !!(await l.account.get( account ));
	},
	User:User,
	async getIdentifier( i ) {
		if( i ) return await l.clients.get( i );
		return getIdentifier();
	},
        async addIdentifier( i ) {
		
            	return l.clients.set( i.key, i );
        },
        async getOrg( i ) {
		
            	return l.clients.set( i.key, i );
        },
	Device:Device,
	UniqueIdentifier:UniqueIdentifier,

	// register a service... this essentially blocs 
	async getService( ws, service ) {
		//console.trace( "GET service:", ws, service );
		const org = await Organization.get( service.org );
		if( !org ) {
			const reg = { p:null, res:null,rej:null,msg:service,ws:ws };
			reg.p = new Promise( (res,rej)=>{
				reg.res = res; reg.rej=rej;
			} );
			console.log( "Adding pending registration ", reg)
			l.registrations.push( reg );
			return reg.p;
		}
		const dmn = await org.getDomain( service.domain );
		if( !dmn ) {
			console.log( "Add domain, should result with adding domain..." );
			return org.addDomain( service.domain );;
		}
		const oldService = await dmn.getService( service.service );
		if( !oldService ) {
			// this returns a service instance....
			return dmn.addService( service.service );
		}


		console.log( "Resulting with service" );
		return oldService;
	},
	async requestService( domain, service, forUser ) {
		const oldDomain = await l.domains.get( domain );
		const oldService = await oldDomain?.getService( service, forUser );

		if( !oldDomain || !oldService ) {
			// don't allow guests to create services.
			if( forUser.guest ) return null;

			console.log( "Registrations?", l.registrations );
			for( let r = 0; r < l.registrations.length; r++ ) {
				const regPending = l.registrations[r];
				const reg = regPending.msg;
				if( reg.domain === domain ) {
					if( reg.service === service ) {
						// this service needs to be created now...
						//console.log( "Found a registration for a domain....", reg, forUser );
						const org = ( await Organization.get( reg.org, forUser ) ) || ( await Organization.new( reg.org, forUser ) );	
						//console.log( "Got org:", org );
						const dmn = await org.getDomain( reg.domain, forUser );
						//console.log( "Got domain:", dmn );
						const svc = await dmn.getService( reg.service, forUser );
						//console.log( "Got service:", svc );
						const badges = await svc.makeBadges( reg.badges, forUser );

						const inst = svc.addInstance( regPending.ws );
						// resolve the registration
						regPending.res( inst );
						l.registrations.splice( r, 1 );

						//console.log( 'authorize...', svc, stringifier.stringify( org ) );
						// radio the service ahead of time, allowing the service to setup for the user
						// gets back a connection token and address...
						//const redirect = svc.authorize( forUser );
						return inst;
					}
				}
			}
			console.trace( "Failed to find service...", domain, service );
			return undefined;
		} else {
			// it might still be pending registration....
			console.log( 'already exists, but registrations:', l.registrations );
		}
		//return oldService;
		const inst = oldService.getConnectedInstance();
		console.log( "forUser", forUser );
		return inst;
	},

	async grant( id, key, addr ) {
		const auth = l.authorizing.get( id );
		if( auth ) {
			auth.res( {key:key,addr:addr} );
		} else {
			console.trace( "Why is somoene granting authorization that wasn't requested?", id, key, addr );
		}
	}


}

Object.freeze( UserDb );
export {configObject as config};
export { UserDb, initializing as go } ;
