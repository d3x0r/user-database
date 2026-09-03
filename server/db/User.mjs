import {sack} from "sack.vfs"
//const JSOX = sack.JSOX;
import {config} from "../config.mjs"
import {UserDb,l,StoredObject,settle} from "../userDb.mjs"
import {sameSash} from "./Sash.mjs"


export class User  extends StoredObject{
	userId = null; 
	unique = null;
	account = null;
	name = null;
	email = null;
	pass = null;
	guest = true;
	next_login = null;
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
	static addUser( user,account,email,pass ){
		//if( "string" !== typeof pass ) throw new Error( "Please pass a string as a password" );
		const newUser = new User();
		//newUser.hook( l.storage );
		newUser.account = ''+account;
		newUser.name = ''+user;
		newUser.email = ''+email;
		newUser.pass = ''+pass;
		newUser.unique = null;
		newUser.store();
		return newUser;
	}
	store() {
		return super.store().then( async (id)=>{	
			//console.log( "what about?", id, l );
			//console.log( "Setting account to:", this.account, this );
			await l.account.set( this.account, this );
			await l.name.set( this.name, this );
			//console.log( "Account was set" );
			if( this.email )
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
	async addSash( sash ) {
		for( let i = 0; i < this.sashes.length; i++ ) {
			let w = this.sashes[i];
			w = this.sashes[i] = await settle( w );
			if( w && w.sash && !( "badges" in w ) ) w = this.sashes[i] = w.sash;
			if( sameSash( w, sash ) ) return false; // already wearing it
		}
		this.sashes.push( sash );
		await this.store();
		return true;
	}
	async removeSash( sash ) {
		const keep = [];
		let removed = false;
		for( let w of this.sashes ) {
			w = await settle( w );
			if( w && w.sash && !( "badges" in w ) ) w = w.sash;
			if( !w ) continue;
			if( sameSash( w, sash ) ) { removed = true; continue; }
			keep.push( w );
		}
		if( removed ) { this.sashes = keep; await this.store(); }
		return removed;
	}

	async getSash( domain ) {
		if( (!config.allowGuestServices) && this.guest ) return { guest:true };
		const badges = {};
		const found = [];
		let s = 0;
		for( ; s < this.sashes.length; s++ ) {
			let sash = this.sashes[s];
			// revived from storage these are still references (promises) or the stored
			// wrapper; settle them in place so later lookups see real Sash objects.
			sash = await settle( sash );
			if( sash && !( "for" in sash ) && sash.sash ) sash = sash.sash;
			if( !sash || "function" !== typeof sash.for ) { console.log( "User has an unusable sash entry:", this.sashes[s] ); continue; }
			this.sashes[s] = sash;
			if( sash.for( domain ) )
				found.push(sash);
		} ;
		let sash = null;
		//console.log( "Found?", found, this, this.sashses, domain );
		if( !found.length ) {
			
		}
		if( found.length > 1 ) {
			// more than one hat for this service: ask the client which to wear.  Handlers
			// get one argument and reply with a sash name (or a promise of one); on() returns
			// every handler's result.  No answer means the most capable sash.
			let picked = null;
			const results = UserDb.on( "pickSash", { user:this, choices:found } );
			if( results instanceof Array ) for( const r of results ) {
				try { const v = await r; if( v ) { picked = v; break; } }
				catch( err ) { console.log( "sash pick failed:", err && err.message || err ); }
			}
			const pickedName = picked && ( picked.name || picked );
			sash = ( pickedName && found.find( ( s )=>s.name === pickedName ) )
				|| found.find( ( s )=>s.master )
				|| found.slice().sort( ( a, b )=>( b.badges ? b.badges.length : 0 ) - ( a.badges ? a.badges.length : 0 ) )[0];
		}else sash = found[0];
		if( sash && sash.badges instanceof Array )
		for( let badge of sash.badges ) {
			badge = await settle( badge );
			if( badge && badge.tag ) badges[badge.tag] = true;
		}
		return badges;
	}

	static async get( account ) {
		// account should be a string, but get/set on bloomnhash will handle strings
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
	
	static getEmail( email ) {
		if( email && email === "" ) return null; // all NULL email addresses are allowed.
		//console.log( "l?", l.email, email );
		return l.email.get( email );
	}
	
}

