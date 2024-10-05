
const debug_ = false;  // controls logging... 

import {sack} from "sack.vfs"
const JSOX=sack.JSOX;
const stringifier = JSOX.stringifier();
const config = await import( "file://"+process.cwd()+"/config.jsox" );
export {config as config_}
import {BloomNHash} from "@d3x0r/bloomnhash"
import {SlabArray}  from "@d3x0r/slab-array"
import {handleRequest as socketHandleRequest} from "@d3x0r/socket-service";

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

export const l = {
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

import {UniqueIdentifier} from "./db/UniqueIdentifier.mjs"
export {UniqueIdentifier};
// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

import { StoredSash,sashToJSOX, sashFromJSOX, Sash, SashAlias } from "./db/Sash.mjs";
export { Sash, SashAlias };
// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

import {Badge} from "./db/Badge.mjs"
export {Badge};

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

import { StoredOrganization,orgFromJSOX,Organization } from "./db/Organization.mjs";
export {Organization};

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

import { StoredDomain, domainFromJSOX, createInitialDomain, Domain } from "./db/Domain.mjs";
export {Domain};

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

import { StoredService,ServiceInstance,serviceToJSOX, Service } from "./db/Service.mjs";
export { Service } 

import {User} from "./db/User.mjs"
export {User}

// - - -  - - - - - - - -  -- - - - - - - ---  -- - - - - - - - - - -  -- - - - - -- -

function getUser(id) {
	return User.get( id ); // is async
} 
async function getIdentifier(){
	const unique = new UniqueIdentifier();
	unique.key = sack.Id();
	unique.hook( storage );
	unique.store();
	await UserDb.addIdentifier( unique);
	return unique;
}
async function makeIdentifier(id){
	const unique = new UniqueIdentifier();
	unique.key = id;
	unique.hook( storage );
	unique.store();
	await UserDb.addIdentifier( unique);
	return unique;
}



import {Device} from "./db/Device.mjs"
export {Device}


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
		console.trace( "------------- HOOK USER DATABASE --------------- ");
		//jsox.fromJSOX( "~T", TextureMsg, buildTexturefromJSOX );
		encoders.forEach( e=>stringifier.toJSOX( e.tag, e.p, e.f ) );

		storage.addEncoders( encoders );
		storage.addDecoders( [ { tag:"~U", p:User, f: null }
			, { tag:  "~D", p:Device, f: null }
			, { tag:  "~I", p:UniqueIdentifier, f: null } 
			, { tag:  "~O", p:StoredOrganization, f: orgFromJSOX }
			, { tag: "~Dm", p:StoredDomain, f: domainFromJSOX }
			, { tag:"~Svc", p:StoredService, f: Service.serviceFromJSOX }
			, { tag:"~SvI", p:ServiceInstance, f:null }
			, { tag:"~Ssh", p:StoredSash, f:sashFromJSOX  }
			, { tag:  "~B", p:Badge, f:null  }
	 	] );

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
			console.log( "reloading account map?", l.account, l.ids );
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
		if( i ) {
			console.log( "clients to get ID fails?", i );
			return l.clients.get( i ).then( (id)=>{
				if( !id ) {
					console.trace( "Why did something get id null?", i, id );
				}
				if( id && !id.id ){
					console.log( "make sure we update to be a stored object?");
					debugger;
					id.store();
					l.clients.store();
				}
				return id;
			});
		}
		return getIdentifier();
	},
	async makeIdentifier( i ) {
		return makeIdentifier(i);
	},
        async addIdentifier( i ) {
			
            return l.clients.set( i.key, i );
        },
        async getOrg( i ) {		
            	return l.orgs.get( i.key, i );
        },
	Device:Device,
	UniqueIdentifier:UniqueIdentifier,
	socketHandleRequest,
	saveContinue(user, id){
		if( user.next_login )
			l.reconnect.delete( user.next_login );
		l.reconnect.set( id, user );
		user.next_login = id;
		return user.store();
	},
	async resume( id ) {
		const user = await l.reconnect.get( id );
		return user;
	},

	// register a service... this essentially blocs 
	async getService( ws, service ) {
		console.log( 'this is called when a service registers...', "(service)",service.service, service.description )
		function defer(why) {
			console.log( "Service:", service.description, " has to wait for registration...", why==2?"Service request pending":why);
			const reg = { p:null, res:null,rej:null,msg:service,ws:ws };
			reg.p = new Promise( (res,rej)=>{
				reg.res = res; reg.rej=rej;
			} );
			//console.log( "Adding pending registration of Org", reg)
			l.registrations.push( reg );
			return reg.p;
		}
		//if( !ws.state.user ) return defer();
		//console.log( "GET (registration?) service:", ws.connection.remoteAddress, service.description );
		const org = await Organization.get( service.org );
		if( !org ) return defer(0);
		const dmn = await org.getDomain( service.domain );
		if( !dmn ) return defer(1);
		
		const oldService = await dmn.getService( service.service, null );
		if( !oldService ) return defer(2);
		
		//console.log( "Resulting with service( unless defeerred)" );
		return oldService;
	},
	async requestService( domain, service, forUser ) {

		let oldDomain = await l.domains.get( domain );
		//console.log( "Domain:", domain, oldDomain, forUser );
		// this is actually check pending registrations (which might only be a service and not a domain.)
		createInitialDomain( domain, service, forUser );

		debug_ && console.log( "Have a domain now, doncha?", domain, service, oldDomain );
		const oldService = await oldDomain?.getService( service, forUser );

		if( !oldDomain || !oldService ) {
			// don't allow guests to create services.

			if( !config.allowGuestServices && forUser.guest ) return null;
			
			console.trace( "Failed to find service...", domain, service );
			return undefined;
		} /*else {
			// it might still be pending registration....
			
			console.log( 'already exists, but registrations:', l.registrations, dom.services );
		}*/
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
