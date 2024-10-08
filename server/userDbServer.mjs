
//console.log( "meta?", import.meta );
const debug_ = false;
const debug_messages_ = false;
const _debug_email = false;
const enable_device_tracking = false;
const track_unique_identifiers = false;
const enable_reconnect = true;

import DNS from 'dns';

const colons = import.meta.url.split(':');
const where = colons.length===2?colons[1].substr(1):colons[2];
const nearIdx = where.lastIndexOf( "/" );
const nearPath = where.substr(0, nearIdx );
console.log( "nearpath is parent?", nearPath )
//console.log( "environment:", process.env );

import path from "path";
import {sack} from "sack.vfs"
import {getRequestHandler} from "sack.vfs/apps/http-ws";
import {Protocol} from "sack.vfs/protocol";
const nativeDisk = sack.Volume();
const config = (await import( ((process.platform=="win32")?"file://":"")+process.cwd()+"/config.jsox" )).default;
import {handleRequest as socketHandleRequest} from "@d3x0r/socket-service";
const withLoader = true;//process.env.SELF_LOADED;
// make sure we load the import script

const JSOX = sack.JSOX;
import {UserDb,User,Device,UniqueIdentifier,go} from "./userDb.mjs"

const storageDb = sack.DB( process.env.DSN || config.dsn || "maria-udb");
const storage = new sack.ObjectStorage( storageDb );//( "fs/data.os" );
UserDb.hook( storage );

function read( name ) {
        try {
                const data = sack.Volume.readAsString( name );
                return data;
        } catch(err) {
                console.log( "Failed to load cert:", name );
                return undefined;
        }
}

const methods = sack.Volume().read( nearPath+"/userDbMethods.js" ).toString();
const methodMsg = JSON.stringify( {op:"addMethod", code:methods} );

const serviceMethods = sack.Volume().read( nearPath+"/serviceDbMethods.js" ).toString();
const serviceMethodMsg = JSON.stringify( {op:"addMethod", code:serviceMethods} );

const serviceLoginScript = sack.Volume().read( nearPath+"/serviceLogin.mjs" ).toString();

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


console.log( "getting request handler?" );
export const loginRequest = getRequestHandler(	{ 
		resourcePath: nearPath + "/../ui" ,
		npmPath: nearPath+"../"
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
		resourcePath: nearPath + "/../ui" ,
		npmPath: nearPath + "/..",
                cert : certChain,
                key : certKey
		};
	//console.log( "serving from?", serverOpts );
	if( config.certPath ) Object.assign( serverOpts, { 
				 cert :nativeDisk.read( config.certPath + "/cert.pem" ).toString()
				, key : nativeDisk.read( config.certPath + "/privkey.pem" ).toString()
				, ca : nativeDisk.read( config.certPath + "/fullchain.pem" ).toString()
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
		if( nativeDisk.isDir( filePath ) ) filePath += "/index.html"; 
		if( nativeDisk.exists( filePath ) ) {
			const headers = { 'Content-Type': "text/javascript", 'Access-Control-Allow-Origin' : req.connection.headers.Origin };
			//if( contentEncoding ) headers['Content-Encoding']=contentEncoding;
			res.writeHead(200, headers );
			res.end( nativeDisk.read( filePath ) );
console.log( "--- write head --- " );
			return true;
		}
	}
}



function openLoginServer( opts, cb )
{
	const server = new UserServer( opts );
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
					ws.close( );
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
					ws.close( );
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
			//console.log( "MSG:", msg_ );
			const msg = JSOX.parse( msg_ );
			//console.log( 'userLocal message:', msg );
			if( msg.op === "register" ) {
				//console.log( "This will be a pending service registration");
				handleServiceMsg( ws, msg );
				//ws.send( methodMsg );
			} else if( msg.op === "expect" ) {
				// user connection expected on this connection...
				console.log( "Authorize sent - now e need to send back UID and IP", msg)				
				UserDb.grant( msg.id, msg.key, msg.addr );
				//ws.send( JSOX.stringify( { op:"authorize", id:msg.id, addr:msg.addr } ) );

			} else {
				console.log( "unhandled client admin/profile message:", msg_ );
			}
		}

		function handleClient( ws, msg_ ) {
			ws = MyWS;
			const msg = JSOX.parse( msg_ );
			debug_messages_ && console.trace( 'UserDbServer message:', msg );
			try {
				if( msg.op === "hello" ) {
					//ws.send( methodMsg );
				} else if( track_unique_identifiers && msg.op === "newClient" ){
					newClient( ws, msg );
				} else if( msg.op === "request" ){
					getUserService( ws, msg );
				} else if( msg.op === "service" ){
					getUserService( ws, msg );
				} else if( msg.op === "login" ){
					doLogin( ws, msg );
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
	
	//console.table( nativeDisk.dir() );

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
				//ws.send( JSON.stringify( { op:"login", success: false, ban: true } ) );
				//return;
			}

			const useClient = isClient;
		}

		// 👻 or 😊 
		if( msg.user.includes( "\u{FEFF}" ) ) {
			console.log( "Includes bad character" );
			ws.send( JSON.stringify( { op:"guest", success: false, name:true } ));
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
			ws.send( JSON.stringify( { op:"guest", success: true } ));
			{
				const key = sack.Id();
				UserDb.saveContinue( user, key );
				ws.send( JSON.stringify( {op:"set", value:"resume", key }));
			}
			return;
		}
		//console.log( "sending false" );
		//console.log( "guest password failure" );
		ws.send( JSON.stringify( { op:"guest", success: false } ));
	}

	async function resume( ws, msg ){
		const user = await UserDb.resume( msg.id );
		if( user ) {
			// they had the resume key, so password/email/etc are them... 
			ws.state.user = user;

			// login could be replayed instead?
			//ws.state.login = msg;
			if( user.guest )
				ws.send( JSON.stringify( { op:"guest", success: true } ));
			else
				ws.send( JSON.stringify( { op:"login", success: true } ));

			{
				const key = sack.Id();
				UserDb.saveContinue( user, key );
				ws.send( JSON.stringify( {op:"set", value:"resume", key }));
			}
		}
		else console.log( "Resume ID didn't match a user?", msg );
	}

	async function doLogin( ws, msg ){
		if( track_unique_identifiers ) {
			const isClient = await UserDb.getIdentifier( msg.clientId );
			// just need SOME clientID.
			if( !isClient ) {
				console.log( "Login could not find the client by identifer:", msg );
				ws.send( JSON.stringify( { op:"login", success: false, ban: true } ) );
				return;
			}
			//console.log( "login:", msg );
			//console.log( "client:", isClient );
		}
		console.log( 'waiting for a user forever?')
		const user = await UserDb.getUser( msg.account );
		console.log( "user:", user );
		
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
		if( !user || user.pass !== msg.password ) {
			console.log( "No User or Bad password");
			ws.send( JSON.stringify( { op:"login", success: false } ) );
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
				ws.send( JSON.stringify( {op:"login", success:false, device:true } ) );
				return;
			}
			if( !dev.active ) {
				console.log( "inacive state");
				ws.send( JSON.stringify( {op:"login", success:false, inactive:true } ) );
				return;
			}
		}
		//console.log( "sending false" );
		//console.log( "Otherwise I guess it's true?" );
		ws.send( JSON.stringify( { op:"login", success: true } ));
		if( enable_reconnect ) {
			const key = sack.Id();
			UserDb.saveContinue( user, key );
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
			ws.send( JSON.stringify( { op:"create", success: false, name:true } ) );
			return;
		}

		// with hashed email, cannot validate email address.
		const validEMail = true;//await checkEmail( msg.email );
		if( false && !validEMail ) {
			console.log( "bad create email");
			ws.send( JSON.stringify( { op:"create", success: false, email:true } ) );
			return;
		}
		if( track_unique_identifiers ) {
			const unique = await UserDb.getIdentifier( msg.clientId );//new UniqueIdentifier();
			if( !unique ) {                              
				//console.log( "Resulting with a reset of client ID." );
				ws.send( JSON.stringify( { op:"create", success: false, ban: true } ) );
				return;
			}
		}

		const oldUser = await UserDb.User.get( msg.account );
		if( oldUser ) {
			console.log( "user Account exists");
			ws.send( JSON.stringify( { op:"create", success: false, account:true } ) );
			return;
		}

		const oldUser2 = msg.email && (await UserDb.User.getEmail( msg.email ));
		if( oldUser2 ) {                 
			console.log( "create user email exists");
			ws.send( JSON.stringify( { op:"create", success: false, email:true } ) );
			return;
		}

		const user = await User.addUser( msg.user, msg.account, msg.email, msg.password );
		//console.log( "user created:", user );
		ws.state.user= user;
		ws.state.user.authorize = true;
		// Looks like this should have passed all setup conditions and got created?
		console.log( "Success creating user." );
		ws.send( JSON.stringify( {op:"create", success:true } ) );
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
			const svcInst = await  UserDb.getService( ws, msg.svc ).then( (s)=>{
				console.log( "Ahh Hah, finall, having registered my service, I connect this socket", s, ws );
				return s.addInstance( ws );
			} );
			if( svcInst ) {
				// register service finally gets a result... and sends my response.
				console.log( "Service resulted, and is an instance?", svcInst );
				//ws.send( JSOX.stringify( { op:"register", ok:true, sid: svc.sid } ) );
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
		if( inst ) {
			//console.log( "Service result:", inst, "for", msg );
			inst.authorize( msg.id, ws.state.user ).then( ( expect )=>{
				//console.log( "Expect should be most of the reply:", expect );
				ws.send( JSOX.stringify( {op:"request", id:msg.id, name:ws.state.user.name, ok:true, svc:expect } ) );
			} );
		} else {
			if( ws.state.forGuest )
				ws.send( JSOX.stringify( {op:"request", id:msg.id, ok:false, noUsers:true } ) );
			else				
			//console.log( "Sending reply to client that we don't have a service yet?" );
				ws.send( JSOX.stringify( {op:"request", id:msg.id, ok:false, probe:true } ) );
		}
	}

	function pickedSash(ws,msg ) {
		if( msg.ok )  state.waits.pickSash.res( msg.sash );
		else          state.waits.pickSash.rej( msg.sash );
	}



function checkEmail( email ) {
	return new Promise( (res,rej)=>{
		validateEmail( email, ( valid )=> {
			if( !valid ) res( false );
			else res( UserDb.isEmailUsed( email ) );
		} );
	});
}

const domainAllowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"
const allowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&'*+-/=?^_`{|}~"
const allowedChars2 = ' .(),:;<>@[]' ; // \ and " can be quoted too; but handled separtely

// this needs to handle just IP addresses also.

function validateEmail( email, cb ) {
	if( !email ) return cb( false );
	function lookupDomain( domain, cb ) {
		DNS.lookup( domain, (err,address,family)=>{
			_debug_email && console.log( "test domain:",domain, err);
			if( err ) cb( false );
			else cb( true );
		})
	}

	function stripComment( field ) {
		if( field[0] == '(' ) {
			for( var n = 1; n < field.length; n++ )
				if( field[n] == ')' ) {
					return field.substr( n+1 );
				}
			return '';
		}

		if( field[field.length-1] == ')' ) {
			for( var n = field.length-1; n >= 0; n-- )
				if( field[n] == '(' ) {
					return field.substr( 0, n );
				}
			return '';
		}
	return field;
	}

	function quotedAtSplit( email ) {
		var parts = [];
		var quoted = false;
		var escape = false;
		for( var n = 0; n < email.length; n++ ) {
			if( email[n] == '"' ) {
				if( escape ) { escape = false; continue; }
				if( quoted ) { quoted = false; continue; } else { quoted = true; continue; }
			}
			if( email[n] == '\\' )
				if( escape ) { escape = false; continue }
				else if( quoted ) { escape = true; continue; }
			if( escape ) { escape = false; continue; };
			if( email[n] == '@' ) {
				if( quoted ) continue;
				parts.push( email.substr( 0, n ) );
				parts.push( email.substr( n+1 ) );
				return parts;
			}
		}
		return parts;
    }

	function quotedDotSplit( email ) {
		var parts = [];
		var lastPart = 0;
		var quoted = false;
		var escape = false;
		for( var n = 0; n < email.length; n++ ) {
			if( email[n] == '"' ) {
				if( escape ) { escape = false; continue; }
				if( quoted ) { quoted = false; continue; } else { quoted = true; continue; }
			}
			if( email[n] == '\\' )
				if( escape ) { escape = false; continue }
				else if( quoted ) { escape = true; continue; }
			if( escape ) { escape = false; continue; };
			if( email[n] == '.' ) {
				_debug_email&&console.log( "found a dot...", quoted, parts );
				if( quoted ) continue;
				parts.push( email.substr( lastPart, n-lastPart ) );
				lastPart = n+1;
			}
		}
		_debug_email&&console.log( "Tail:", lastPart, email, "=", email.substr( lastPart ) );
		parts.push( email.substr( lastPart ) );
		return parts;
	}
	var parts = quotedAtSplit( email );
	_debug_email&&console.log( "Split:", parts );
	if( parts.length != 2 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	if( parts[0].length > 64 || parts[0].length < 1 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	parts[0] = stripComment( parts[0] );
	if( !parts[0] ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	parts[1] = stripComment( parts[1] );
	if( !parts[1] ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	_debug_email&&console.log( "domain comment-stripped:", parts[1] );

	var local = quotedDotSplit( parts[0] );
	_debug_email&&console.log( "local dot split:", local );
	for( n = 0; n < local.length; n++ ) {
		local[n] = [...local[n]];
	}
	if( parts[1].length > 253 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	var domain = parts[1].split( "." );
	if( domain.length > 127 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	var n;
	for( n = 0; n < local.length; n++ ) {
		if( !local[n].length ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		var len = local[n].length;
		var escape = false;
		if( local[n][0] == '"' ) {
			if( local[n][local[n].length-1] !== '"' ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			len--;
			for( var m = 1; m < len; m++ ) {
				if( local[n][m].codePointAt(0) > 0x7f ) continue;
				if( local[n][m] == "\\" )
					if( escape ) {
						escape = false;
						continue;
					}
					else {
						escape = true;
						continue;
					}
				if( escape ) {
					if( local[n][m] == '"' ) {
						escape = false;
						continue;
					}
				}
				if( !allowedChars.includes( local[n][m] ) )
					if( !allowedChars2.includes( local[n][m] ) )
						{ _debug_email&&console.log( "Fail at char:", m, local[n], local[n][m] ); _debug_email&&console.trace( "FAIL" ); return false; }
			}
		}
		else {
			for( var m = 0; m < len; m++ ) {
				if( local[n][m].codePointAt(0) > 0x7f ) continue;
				if( !allowedChars.includes( local[n][m] ) )
					{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			}
		}
	}

	if( parts[1][0] == '[' && parts[1][parts[1].length-1] == ']' ) {
		parts[1] = parts[1].substr( 1, parts[1].length-2 );
		if( parts[1].startsWith( "IPv6:" ) ) {
			var addrparts = parts[1].split(':' );
			var words = [];
			var zero = 0;
			for( var n = 1; n < addrparts.length; n++ ) {
				if( !addrparts[n].length ) {
					if( zero ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // already found a zero filler
					zero = n;
					words.push( 0 );
				} else {
					var val = parseInt(addrparts[n], 16);
					if( val.toString(16).toUpperCase() !== addrparts[n].toUpperCase() )
						{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
					words.push( val );
				}
			}
			function zeroFill( words ) {
				var newwords = [];
				for( var n = 0; n < zero-1; n++ )
					newwords.push( words[n] );

				for( var m = 0; m < 8-( (words.length-1) ); m++ )
					newwords.push(0);
				n++;
				for( ; n < words.length; n++ )
					newwords.push( words[n] );
				return newwords;
			}
			_debug_email&&console.log( "words:", words );
			words = zeroFill( words );
			_debug_email&&console.log( "words:", words );
			if( words.length !== 8 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( !words[0] ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] > 0xFF00 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to mutlicast email
			if( words[0] == 0xfec0 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to site local
			if( words[0] == 0x0100 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to trash
			if( ( words[0] & 0xFF30 ) == 0xfe80 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to site local
			if( ( words[0] & 0xFC00 ) == 0xfc00 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // unique local
			if( words[0] == 0x2001 && words[1] == 0xdb8 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to example IP

		}
		else {
			var addrparts = parts[1].split('.');
			var words = [];
			if( addrparts.length != 4 )
				{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			for( var n = 0; n < addrparts.length; n++ ) {
				var val = parseInt( addrparts[n] );
				if( val.toString() !== addrparts[n] )
					{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
				if( val > 255 || val < 0 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
				words.push( val );
			}
			// disallow localhost addresses
			if( words[0] == 192 && words[1] == 168 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] == 172 && words[1] >= 16 && words[1] < 32 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] == 10 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] == 127 && words[1] == 0 && words[2] == 0 && words[3] == 1 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }

		}
		return true;  // assume the IP in brackets is valid?
	}
	for( n = 0; n < domain.length; n++ ) {
		_debug_email&&console.log( "domain part:", domain[n] );

		if( domain[n].length < 1 || domain[n].length > 63 ) {
			if( n == (domain.length-1) && domain[n].length === 0 )
				continue;
			{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		}
		if( domain[n][0] == '-' ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		if( domain[n][domain[n].length-1] == '-' ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		var len = domain[n].length;

 		for( var m = 0; m < len; m++ ) {
			if( !domainAllowedChars.includes( domain[n][m] ) )
				{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		}
	}
	lookupDomain( domain.join('.'), cb );
/*
Uppercase and lowercase English letters (a-z, A-Z)
Digits 0 to 9
Characters ! # $ % & ' * + - / = ? ^ _ ` { | }
Character . (dot, period, full stop) provided that it is not the first or last character,
		and provided also that it does not appear two or more times consecutively.
*/
}
