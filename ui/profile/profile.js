


import {Popup,popups} from "/node_modules/@d3x0r/popups/popups.mjs"
import {JSOX} from "/node_modules/jsox/lib/jsox.mjs"


import {connection,openSocket,Alert} from "../login/webSocketClient.js"

const l = {
	login : null, // login form
	ws :null,
}

import {requestService,firstConnect} from "/node_modules/@d3x0r/user-database-remote/requestService.js"  // reverse call openSocket


export class Profile extends Popup {
	#sock = null
	constructor( parent ) {
		super( "User Profile Manager", parent );
		this.hide();
		const this_ = this;
		// this will ahve to be re-opened...
		function connect() {
			const socket = openSocket();
			socket.then( (sock)=>{
				this_.#sock = sock;
				sock.on( "close", (code,reason)=>{
					login.disconnect();
					console.log( "disconnect for login socket... probably OK... but will need it next time. ", code, reason);
					connect();
				} );
				sock.bindControls = connection.bindControls;
				login.setClient( sock );
			} ); // trigger client begin connection... 
		}
		
		const login = l.login = popups.makeLoginForm( async (guest)=>{
			console.log( "parameter is guest?:", guest );
			//console.log( "login form event" );
			//debugger;
			login.hide();
			const info = await connection.request( "d3x0r.org", "login" ).catch( (err)=>{
				console.log( "login service request failed:", err );
				return null;
			} );
			
			console.log( "service information:", info );
			// info is { svc:{ addr:{addr:[...],port}, key:[ id, ... ] }, name }; the key list is
			// one entry per expect handler on the service, and the profile service is this
			// same login server, so connect back to it and identify with the bare key.
			const key = info && info.svc && ( info.svc.key instanceof Array ? info.svc.key[0] : info.svc.key );
			if( key ) {
				openSocket( null, "profile" ).then( (ws)=>{
					ws.onmessage = handleMessage;
					ws.onclose = handleClose;
					ws.send( key );
					this_.load();
					return ws;
				});
			} else {
				Alert( "Profile service failed to be found" );
				login.show();
			}

		} , { useForm:"/login/loginForm.html"
		    , useSashForm:"/login/pickSashForm.html"
		    , sashScript : "/login/pickSashForm.js"
			, ready(root) { // onLoad ?
				connection.bindControls( login, root );

			}
		} );
		// the socket's login/guest/create replies arrive as connector events (see
		// userDbMethods.js doLogin/doGuest/doCreate); requestService.js registers these
		// for services, but this page drives the form itself, so hook them here.
		for( const evt of [ "login", "create", "guest" ] )
			connection.on( evt, (arg)=>login.login( arg ) );
		connect();

		function handleMessage( msg_ ) {
			const msg = JSOX.parse( msg_ );
			console.log( "Really this should be some sort of internal handler?" );
		}
		function handleClose( code, reason ) {
			console.log( "profile service disconnected..." );
			l.ws = null; // service connection... 
			login.show();
		}
	}


	load( something ) {
		popups.fillFromURL( this, "./profileForm.html" );
		this.show();
		
	}
}



