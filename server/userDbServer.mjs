
//console.log( "meta?", import.meta );
const debug_ = false;
const debug_messages_ = false;
const _debug_email = false;
const enable_device_tracking = false;
const track_unique_identifiers = false;
const enable_reconnect = true;

import DNS from 'dns';

const colons = import.meta.url.split(':');
const where = colons.length===2?colons[1].slice(1):(colons[1].slice( 3) + ":" + colons[2]);
const nearIdx = where.lastIndexOf( "/" );
const nearPath = where.substr(0, nearIdx );
//console.log( "environment:", process.env );

import path from "path";
import {sack} from "sack.vfs"
const disk = sack.Volume();
import {ObjectStorage} from "sack.vfs/object-storage"
import {getRequestHandler} from "sack.vfs/apps/http-ws";
import {Protocol} from "sack.vfs/protocol";
const  { OAuth2Client} = (await import( "google-auth-library" ).catch( ()=>({ OAuth2Client: null })) );
import {checkEmail} from "./emailValidator.mjs"
const client = OAuth2Client?new OAuth2Client():null;

import {enableLogin} from "@d3x0r/user-database-remote/enableLogin.mjs";


import {config} from "./config.mjs";

import {handleRequest as socketHandleRequest} from "@d3x0r/socket-service";
const withLoader = true;//process.env.SELF_LOADED;
const resourcePath = [process.env.RESOURCE_PATH, (nearPath + "/../ui")];
const npmPath = [process.env.NPM_PATH, (nearPath+"/..")];
// make sure we load the import script

const JSOX = sack.JSOX;
import {UserDb,User,Device,UniqueIdentifier,go} from "./userDb.mjs"

const storageDb = sack.DB( process.env.DSN || config.dsn || "maria-udb");

const storage = new ObjectStorage( storageDb );//( "fs/data.os" );
UserDb.hook( storage );

const clientConfig = {
	google: !!client
};

function read( name ) {
        try {
                const data = sack.Volume.readAsString( name );
                return data;
        } catch(err) {
                console.log( "Failed to load cert:", name );
                return undefined;
        }
}

const methods = disk.read( nearPath+"/userDbMethods.js" ).toString();
const methodMsg = JSON.stringify( {op:"addMethod", code:methods, config:clientConfig} );

const serviceMethods = disk.read( nearPath+"/serviceDbMethods.js" ).toString();
const serviceMethodMsg = JSON.stringify( {op:"addMethod", code:serviceMethods} );

const serviceLoginScript = disk.read( nearPath+"/serviceLogin.mjs" ).toString();

import {UserDbRemote} from "./serviceLogin.mjs";

function getCertChain( ) {
        //SSLCertificateFile /etc/letsencrypt/live/d3x0r.org/fullchain.pem
        //SSLCertificateKeyFile /etc/letsencrypt/live/d3x0r.org/privkey.pem

        if( process.env.SSL_PATH ) return process.env.SSL_PATH + "/fullchain.pem"
        return  nearPath + "/certgen/cert-chain.pem"
}
function getCertKey( ) {
        if( process.env.SSL_PATH ) return process.env.SSL_PATH + "/privkey.pem"
        return  nearPath + "/certgen/rootkeynopass.prv"
}

const certChain = read( getCertChain() );
const certKey = read( getCertKey() );


console.log( "getting request handler?", process.env.RESOURCE_PATH || (nearPath + "/../ui")  );
export const loginRequest = getRequestHandler(	{ 
		resourcePath,
		npmPath
		} );
 
//import {UserDbServer} from "./userDbLoginService.mjs";
//const methodMsg = JSON.stringify( {op:"addMethod", code:methods} );



const l = {
	newClients : [],
	services : new Map(),
	states : [],
	expect : new Map(),
}


const resourcePerms22 = [
	{  file:"ui/admin/adminForm.html",  perm:"edit",   fallback:"ui/admin/noPerm.html" }
	,{ file:"ui/admin/adminForm.js",    perm:"edit",   fallback:null  }
]

const resourcePerms = {
	"ui": {
		admin: {
			"adminForm.html": { perm:"edit",   fallback:"ui/admin/noPerm.html" },
			"adminForm.js": { perm:"edit",   fallback:null },
		}
	}
}

// go is from userDb; waits for database to be ready.
if( withLoader ) go.then( ()=>{
	const port = Number(process.env.LOGIN_PORT) || Number(process.env.PORT) || Number(process.argv[2])||8600 ;
	const serverOpts = { port ,
		resourcePath,
		npmPath,
                cert : certChain,
                key : certKey
		};
	//console.log( "serving from?", serverOpts );
	if( config.certPath ) Object.assign( serverOpts, { 
				 cert :disk.read( config.certPath + "/cert.pem" ).toString()
				, key : disk.read( config.certPath + "/privkey.pem" ).toString()
				, ca : disk.read( config.certPath + "/fullchain.pem" ).toString()
			} );

       openLoginServer( 		serverOpts );
} );
//else {
//	function doNothing() { setTimeout( doNothing, 10000000 ); } doNothing();
//}


UserDb.on( "pickSash", (user, choices)=>{
	for( let state of l.states ) {
		if( state.user === user
		  && !state.connected 
		  && !state.picking ) {
			state.picking = true;
			const p = { p:null, res:null, rej:null};
			p.p = new Promise( (res,rej)=>{ p.res = res; p.rej= rej } );
			state.waits.pickSash = p;
			state.ws.send( JSOX.stringify( { op:"pickSash", choices: choices } ) );
			return p.p;
		}
	}
	throw new Error( "How are you picking a sash for a user that's not connected?" );
} );

function serviceRequestFilter( req, res ) {
	console.log( "userDbServer req filter:", req.url );
	if( req.url == "/serviceLogin.mjs" ) {
		let filePath = nearPath + "/../ui"+ req.url;
		if( disk.isDir( filePath ) ) filePath += "/index.html"; 
		if( disk.exists( filePath ) ) {
			const headers = { 'Content-Type': "text/javascript", 'Access-Control-Allow-Origin' : req.connection.headers.Origin };
			//if( contentEncoding ) headers['Content-Encoding']=contentEncoding;
			res.writeHead(200, headers );
			res.end( disk.read( filePath ) );
console.log( "--- write head --- " );
			return true;
		}
	}
}

function expectRequest( msg ) {
	const id = sack.Id();
	console.log( "Expect request from user:", msg );
	connections.set( id, msg );
	return id;
}

function openLoginServer( opts, cb )
{
	const server = new UserServer( opts );

	enableLogin( server.server, server.server.app, expectRequest );

	console.log( "login serving on " + opts.port );
	// this connects my own service to me...
	// do I need this?
	//   Fails without a service configuration anyway...
	const coreService = UserDbRemote.open( { server:config.certPath?"wss://localhost:":"ws://localhost:"+opts.port
			, configPath:process.cwd() + "/"
			, connect() {
				console.log( 'Login self-service completed registration?')
				coreService.on( "expect", expectUser );
			}
		 } );
}


export class UserServer extends Protocol {
	constructor( opts ) {
		super( opts );
		this.on("accept", (ws)=>this.accept(ws) );
		this.on("connect", (ws,myWS)=>this.connect(myWS) );
		const this_ = this;
		// server app is a uexpress instance.
		this.server.app.get( "/gsi/", (req, res)=>{
			console.log( "Google Service Sent us a request?", req );
		});
		// server.server is the websocket itself
		this.server.server.on( "lowError",function (error, address, buffer) {
			if( error !== 1 ) 
				console.log( "Low Error with:", error, address, buffer  );
			if( buffer )
				buffer = new TextDecoder().decode( buffer );
			this_.server.server.disableSSL(buffer); // resume with non SSL
		} );

		console.log( "File handler is a protocol level handler... should only add once?" );
		this.addFileHandler();
	}

	accept(ws){
		if( !ws.headers ) {
			console.log( "Incomplete socket request:", ws );
			return false;
		}
		const protocol = ws.headers["Sec-WebSocket-Protocol"];

		//console.log( "accept?", protocol );
		if( protocol === "login" ){
			return true;
		} else if( protocol === "profile" ) {
			return true;
		} else if( protocol === "admin" ) {
			return true;
		} else if( protocol === "userDatabaseClient" ) {
			const parts = ws.url.split( "?" );
			if( parts.length > 1 ) {
				const sid = parts[parts.length-1];
				// this connects to a service by identifier.
				const service = l.services.get(sid);
				if( service ) {
					//this.accept();
					return true;
				} // otherwise it's an invalid connection... 		
			}
			else {
				return true;
			}
		}
		return false;
	}


	connect(ws) {
		const MyWS = ws; // we do get a MyWS in connect.
		//const ws = MyWS.ws;
		const protocol = ws.ws.headers["Sec-WebSocket-Protocol"];
		let user = null;
		console.log( "Connect:", ws.ws.connection.remoteAddress, "protocol:", protocol )
		ws.state = new LoginState( ws );
		if( protocol === "userDatabaseClient" ) {
			//console.log( "send greeting message, setitng up events" );
			
			ws.on("message", handleService );
			ws.on("close", closeService );
			console.log( "sending service fragment" );
			ws.send( serviceMethodMsg );
		} else if( protocol === "admin" ){
			ws.on("message", handleAdmin);
		} else if( protocol === "profile" ){
			ws.on("message", handleProfile);
		} else if( protocol === "userDatabasePeer" ){
			ws.on("message", handlePeer);
			negotiatePeer();
		} else if( protocol === "login" ){
			//console.log( "send greeting message, setting up events" );
			ws.on("message", handleClient);
			ws.send( methodMsg );
		} else 
			return false;

		ws.ws.onclose = function(code,reason) {
			//console.log( "Remote closed" );
			ws.on("close", [code,reason] );	
			for( let s = 0; s < l.states.length; s++ ) {
				const st = l.states[s];
				if( st.ws === ws ) {
					l.states.splice( s, 1 );
				}
			}
		};

		return true;
		
		function handlePeer( ws, msg_ ) {
			const msg = JSOX.parse( msg_ );
			if( msg.op === "getIndexes" ) {
				const indexes = UserDb.getIndexes();
				ws.send( {op:"indexes:", ids:indexes.ids } );
	
			} else if( msg.op === "getIndexes" ) {
				const indexes = UserDb.getIndexes();
				ws.send( {op:"indexes:", ids:indexes.ids } );
	
			}
			
		}

		function negotiatePeer() {
			// tell peer some information about me?
			// give the peer the script to be my peer?

		}

		function handleProfile( ws, msg_ ) {
			//console.log( 'profile Socket message:', msg );
			if( !user ) {
				user = l.expect.get( msg_ );
				console.log( "Using message to look up expected user", msg_, user );
				if( !user ) {
					ws.send( JSOX.stringify( {op:"badIdentification"}));
					ws.close( 3002, "Bad Identification" );
					return;
				}else
					l.expect.delete( msg_ );
				//console.log( "user connected!", user );
			}else {
				const is_ll = msg_[0] === "\0";
				const msg = is_ll?JSOX.parse( msg_.substr(1) ):JSOX.parse( msg_ );
				if( is_ll && msg.op === "get" ){
					//, {op:"get", url:url, id:newEvent.id } );
					if( msg.url ){
			                	const res = getResource( msg.url, null, user );
						ws.send( JSOX.stringify( {op:"GET", id:msg.id, res:res } ) );
					}
					else
						ws.send( JSOX.stringify( {op:"GET", id:msg.id, res:{code:0,content:"bad request",contentType:"text/plain"} } ) );
					return true;
				}
				else if( msg.op === "" ){
					if( !user.badges.edit ) {

					}else {

					}
				}
			}
		}


		function handleAdmin( ws, msg_ ) {
			//console.log( 'admin Socket message:', msg );
			if( !user ) {
				user = l.expect.get( msg_ );
				if( !user ) {
					ws.send( JSOX.stringify( {op:"badIdentification"}));
					ws.close( 3003, "Bad Identification" );
					return;
				}else
					l.expect.delete( msg_ );
			}else {
				const is_ll = msg_[0] === "\0";
				const msg = is_ll?JSOX.parse( msg_.substr(1) ):JSOX.parse( msg_ );
				if( is_ll && msg.op === "get" ){
					//, {op:"get", url:url, id:newEvent.id } );
					if( msg.url ){
			                	const res = getResource( msg.url, null, user );
						ws.send( JSOX.stringify( {op:"GET", id:msg.id, res:res } ) );
					}
					else
						ws.send( JSOX.stringify( {op:"GET", id:msg.id, res:{code:0,content:"bad request",contentType:"text/plain"} } ) );
					return true;
				}
				else if( msg.op === "" ){
					if( !user.badges.edit ) {

					}else {

					}
				}
			}
		}

		function doAuthorize( ws, msg ) {
			// msg.addr
			// msg.key
			
		}

		function closeService(code,reason ) {
			
		}

		function handleService( ws, msg_ ) {
			console.log( "MSG:", msg_ );
			const msg = JSOX.parse( msg_ );
			//console.log( 'userLocal message:', msg );
			if( msg.op === "register" ) {
				//console.log( "This will be a pending service registration");
				handleServiceMsg( ws, msg );
				//ws.send( methodMsg );
			} else if( msg.op === "expect" ) {
				// user connection expected on this connection...
				UserDb.grant( msg.id, msg.key, msg.addr );
			} else {
				console.log( "unhandled client admin/profile message:", msg_ );
			}
		}

		function handleClient( ws, msg_ ) {
			ws = MyWS;
			console.log( "MSG:", msg_ );
			const msg = JSOX.parse( msg_ );
			debug_messages_ && console.trace( 'UserDbServer message:', msg );
			try {
				if( msg.op === "hello" ) {
					//ws.send( methodMsg );
				} else if( msg.op === "newClient" ){
					if( track_unique_identifiers )
						newClient( ws, msg );
					else console.log( "Not tracking client identifiers, don't send server generated devkey...", msg );
				} else if( msg.op === "request" ){
					getUserService( ws, msg );
				} else if( msg.op === "service" ){
					getUserService( ws, msg );
				} else if( msg.op === "login" ){
					if( msg.google ) {
						doLogin( ws, msg, true );
					}else
						doLogin( ws, msg, false );
				} else if( enable_reconnect && msg.op === "resume" ){
					resume( ws, msg );
				} else if( msg.op === "device" ){
					addDevice( ws, msg );
				} else if( msg.op === "guest" ){
					guestLogin( ws, msg );
				} else if( msg.op === "authorize" ){
					doAuthorize( ws, msg );
				} else if( msg.op === "Login" ){
					ws.send( JSON.stringify( { op:"login", success: true } ));
				} else if( msg.op === "create" ){
					doCreate( ws, msg );
				} else if( msg.op === "pickSash" ){
					pickedSash( ws, msg );
				} else {
					// this is handled other places...
					if( msg.op === 'get' ) ;
					else
						console.log( "Unhandled message:", msg );
				}
			} catch(err) {
				console.log( "Something bad happened processing a message:", err );
			}
		};

	}

		
}

	function expectUser( uid, user ) {
		const userId = sack.Id();
		l.expect.get( userId, user )
		console.trace( "Getting an expectation", userId, user )
		return userId; // returning this ID is what the client will use for us...
		// the login service will tell the client this response... 
	}
	
	//console.table( disk.dir() );

	class ServiceConnection {
		serviceId = sack.Id();
		ws = null;
		constructor() {
		}
	}

	function setKey( f, ws, val ) {
		if( !f || f === "undefined") {
			f = sack.Id();
			console.log( 'sending new id', f );
			ws.send( `{"op":"set","value":"${val}","key":${JSON.stringify(f)}}` );
		}
		return f;
	}

	function sendKey( ws, val, f ) {
		ws.send( `{"op":"set","value":"${val}","key":${JSON.stringify(f)}}` );
	}


	async function guestLogin( ws, msg ){

		if( track_unique_identifiers ) {
			let isClient = await UserDb.getIdentifier( msg.clientId );
		
			if( !isClient ) {
				// happens from bleedover with local dev testing...
				// happens changing working directory from one place to another.
				isClient = await UserDb.makeIdentifier( msg.clientId );
				//console.log( "didn't know the client... creating anyway", msg.clientId, msg );
				//ws.send( JSON.stringify( { op:"login", success: false, ban: true, id:msg.id } ) );
				//return;
			}

			const useClient = isClient;
		}

		// 👻 or 😊 
		if( msg.user.includes( "\u{FEFF}" ) ) {
			console.log( "Includes bad character" );
			ws.send( JSON.stringify( { op:"guest", success: false, name:true, id:msg.id } ));
			return;
		}
		//msg.deviceId = setKey( msg.deviceId,ws,"deviceId" );
		const name = "\u{FEFF}👻" + msg.user;
		//console.log( "Userdb Get User with:", name );
		const user = ( await UserDb.getUser( name ) ) || 
				(await User.addUser( name, /*account*/sack.Id(), /*email*/sack.Id()+"@d3x0r.org", "password" ) );

		//console.log( "user:", user );
		if( user ) {
			//if( user.unique.key !== msg.clientId )
			//	sendKey( ws, "clientId", user.unique.key ); // re-identify (leak association?)

			//console.log( "User is set in the client's ws.state (but not the services..." );
			ws.state.user= user;
			ws.send( JSON.stringify( { op:"guest", success: true, id:msg.id } ));
			{
				const key = sack.Id();
				UserDb.saveContinue( user, key );
				ws.send( JSON.stringify( {op:"set", value:"resume", key }));
			}
			return;
		}
		//console.log( "sending false" );
		//console.log( "guest password failure" );
		ws.send( JSON.stringify( { op:"guest", success: false, id:msg.id } ));
	}

	async function resume( ws, msg ){
		const user = await UserDb.resume( msg.uid );
		if( user ) {
			// they had the resume key, so password/email/etc are them... 
			ws.state.user = user;

			// login could be replayed instead?
			ws.send( JSON.stringify( { op:"resume", guest:user.guest, success: true, id:msg.id } ));
			{
				const key = sack.Id();
				UserDb.saveContinue( user, key );
				ws.send( JSON.stringify( {op:"set", value:"resume", key }));
			}
		}
		else {
			console.log( "Resume ID didn't match a user?", msg );
			ws.send( JSON.stringify( { op:"resume", success: false, id:msg.id } ));
		}
	}

	async function doLogin( ws, msg, google ){
		if( track_unique_identifiers ) {
			const isClient = await UserDb.getIdentifier( msg.clientId );
			// just need SOME clientID.
			if( !isClient ) {
				console.log( "Login could not find the client by identifer:", msg );
				ws.send( JSON.stringify( { op:"login", success: false, ban: true, id:msg.id } ) );
				return;
			}
			//console.log( "login:", msg );
			//console.log( "client:", isClient );
		}
		//console.log( 'waiting for a user forever?')
		const user = await UserDb.getUser( msg.account );
		console.log( "user:", google, user );
		let externalCheckOk = false;
		if( client && google ) {
			const reply = await new Promise( (resolve,rej)=>{		

				async function verify() {
					return client.verifyIdToken({
						idToken: msg.cred,
						audience: "710795352839-q4n1q1ckih9erp8g3qfnifplc6o5mmre.apps.googleusercontent.com",  // Specify the WEB_CLIENT_ID of the app that accesses the backend
						// Or, if multiple clients access the backend:
						//[WEB_CLIENT_ID_1, WEB_CLIENT_ID_2, WEB_CLIENT_ID_3]
					}).then( ticket=>{
						//ticket.name (display name)
						//ticket.email (account name/email register)
						const payload = ticket.getPayload();
						const userid = payload['sub'];
						// If the request specified a Google Workspace domain:
						// const domain = payload['hd'];
						console.log( "Guess userid is sub?", ticket, userid, msg.jwt)
						if( payload.sub == msg.jwt.sub ) {
							externalCheckOk = true;
							return true;
						}
					})
				}
				verify().then( resolve ).catch(rej);
			} );
			console.log( "thing:", reply );
		}
		/*
		if( user && user.unique !== isClient ) {
			// save meta relation that these clients used the same localStorage
			// reset client Id to this User.
			//console.log( "User Doing Login with another client:", user, user.unique );
			if( user.unique.key !== isClient.key )
				sendKey( ws, "clientId", user.unique.key );
			else console.log( "unique is not yet UNIQUE..."
					, user.unique.id, isClient.id, user.unique.key, isClient.key );
			// force deviceId to null?
			//msg.deviceId = null; // force generate new device for reversion
		}
		*/

		//console.log( "user:", user, msg.password );
		if( !externalCheckOk && ( !user || user.pass !== msg.password ) ) {
			console.log( "No User or Bad password");
			ws.send( JSON.stringify( { op:"login", success: false, id:msg.id } ) );
			return;
		}
		
		ws.state.user = user;
		ws.state.user.authorize = true; // not guest
		ws.state.login = msg;
		if( enable_device_tracking ) {
			const dev = await user.getDevice( msg.deviceId );
			console.log( "dev:", dev );
			if( !dev ) {
				ws.state.login = msg;
				// ask the device to add a device.
				console.log( "Bad device");
				ws.send( JSON.stringify( {op:"login", success:false, device:true, id:msg.id } ) );
				return;
			}
			if( !dev.active ) {
				console.log( "inacive state");
				ws.send( JSON.stringify( {op:"login", success:false, inactive:true, id:msg.id } ) );
				return;
			}
		}
		//console.log( "sending false" );
		console.log( "Otherwise I guess it's true?" );
		ws.send( JSON.stringify( { op:"login", success: true, id:msg.id } ));
		if( enable_reconnect ) {
			const key = sack.Id();
			UserDb.saveContinue( user, key, msg.deviceId );
			ws.send( JSON.stringify( {op:"set", value:"resume", key }));
		}

	}

	function validateUsername( n ) {
		if( n.includes === "\u{FEFF}" ) {
			return false;
		}
		return true;
	}

	async function doCreate( ws, msg ) {
		if( !validateUsername( msg.user ) ) {
			console.log( "bad create username");
			ws.send( JSON.stringify( { op:"create", success: false, name:true, id:msg.id } ) );
			return;
		}

		// with hashed email, cannot validate email address.
		const validEMail = true;//await checkEmail( msg.email );
		if( false && !validEMail ) {
			console.log( "bad create email");
			ws.send( JSON.stringify( { op:"create", success: false, email:true, id:msg.id } ) );
			return;
		}
		if( track_unique_identifiers ) {
			const unique = await UserDb.getIdentifier( msg.clientId );//new UniqueIdentifier();
			if( !unique ) {                              
				//console.log( "Resulting with a reset of client ID." );
				ws.send( JSON.stringify( { op:"create", success: false, ban: true, id:msg.id } ) );
				return;
			}
		}

		const oldUser = await UserDb.User.get( msg.account );
		if( oldUser ) {
			console.log( "user Account exists");
			ws.send( JSON.stringify( { op:"create", success: false, account:true, id:msg.id } ) );
			return;
		}

		const oldUser2 = msg.email && (await UserDb.User.getEmail( msg.email ));
		if( oldUser2 ) {                 
			console.log( "create user email exists");
			ws.send( JSON.stringify( { op:"create", success: false, email:true, id:msg.id } ) );
			return;
		}

		const user = await User.addUser( msg.user, msg.account, msg.email, msg.password );
		//console.log( "user created:", user );
		ws.state.user= user;
		ws.state.user.authorize = true;
		// Looks like this should have passed all setup conditions and got created?
		console.log( "Success creating user." );
		ws.send( JSON.stringify( {op:"create", success:true, id:msg.id } ) );
	}

	async function addDevice(ws,msg) {
		const user = ws.state.user;
		if( user ) {	
			const dev = await user.addDevice( msg.deviceId, ws.state.user.devices.length < 10?true:false );
			//console.log( "dev:", dev );
			if( !dev.active ) {
				ws.send( JSON.stringify( {op:"device", inactive:true } ) );
				return;
			}
			ws.send( JSON.stringify( { op:"set", value:"deviceId", key:msg.deviceId } ) );
		} else {
			// can't attach a device to not a user.
			console.log( "User Adding device was not found?? Bannable failure.", ws.state );
			// out of sequence - there should be a pending login in need of a device ID.
			//ws.send( JSON.stringify( { op:"device", success: false, ban: true } ) );
		}
		
	}


	function LoginState(ws) {
		this.ws = ws;
		this.client = null;
		this.login = null;
		this.create = null;
		this.user = null;
		this.connected = false;
		this.picking = false;
		this.waits = {
			pickSash : null,  // 
		}
		l.states.push( this );
	}

	async function newClient(ws,msg) {
		ws.state.client = await UserDb.getIdentifier();
		sendKey( ws, "clientId", ws.state.client.key );
		// get adds now...
		//UserDb.addIdentifier( ws.state.client );
		l.newClients.push( { state:ws.state } );
	}


	async function handleServiceMsg( ws, msg ){
		// msg.org is 'org.jsox' from the client
		// sid is the last SID we assigned.
		//console.log( "Service message:", msg );
		if( msg.sid ) {
			console.log( "service is asking to reconnect...", msg.sid );
			// this will wait until a client asks for this service; even on reconnect
			const srvc = await UserDb.getService( ws, msg.svc );
			//console.log( "Service:", srvc );
			const inst = srvc.getServiceInstance( msg.sid, ws );
			if( inst ){
				console.log( "This is connecting the socket to the active instance..." );
				inst.connect( ws );		
			} else {
				console.log(" THis is adding a new instance for that service; BAD id recovery");
				//console.log( "And no service?", srvc );
				srvc./*service.*/addInstance( ws); // does connect also.
				//inst.connect( ws );
			}
		} 
		else 
		{
			console.log( "otherwise find the service (post reg)", msg );
			// msg has addr:[], iaddr:[], loc:(uid), sid:false, op:register
			//       , svc:{badges,description,domain,or,service}
			const svcInst = await  UserDb.getService( ws, msg.svc ).then( (s)=>s.addInstance( ws ) );
			if( svcInst ) {
				// register service finally gets a result... and sends my response.
				console.log( "Service resulted, and is an instance?", svcInst );
				ws.send( JSOX.stringify( { op:"register", ok:true, sid: svcInst.sid } ) );
			}else {
				console.log( "service will always exist or this wouldn't run.");
			}
			
			// waiting to be allowed...
		}
	}

	async function getUserService( ws, msg ) {
		// domain, service
		debug_ && console.log( "Calling requestservice", ws.state );
		//console.log( "So this request should have a user..." );
		const inst = await UserDb.requestService( msg.domain, msg.service, ws.state.user );
		console.log( "is there an instance? (after promise)", inst );
		if( inst ) {
			//console.log( "Service result:", inst, "for", msg );
			inst.authorize( msg.id, ws.state.user ).then( ( expect )=>{
				//console.log( "Expect should be most of the reply:", expect );
				ws.send( JSOX.stringify( {op:"request", id:msg.id, name:ws.state.user.name, ok:true, svc:expect } ) );
			} );
		} else {
			if( ws.state.forGuest )
				ws.send( JSOX.stringify( {op:"request", id:msg.id, ok:false, noUsers:true } ) );
			else {
				console.log( "Sending reply to client that we don't have a service yet?" );
				ws.send( JSOX.stringify( {op:"request", id:msg.id, ok:false, probe:true } ) );
			}
		}
	}

	function pickedSash(ws,msg ) {
		if( msg.ok )  state.waits.pickSash.res( msg.sash );
		else          state.waits.pickSash.rej( msg.sash );
	}



if( "enableExitSignal" in sack.system ) {
	sack.system.enableExitSignal( process.exit.bind(process,0) );
}
