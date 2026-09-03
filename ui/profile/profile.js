


import {Popup,popups} from "/node_modules/@d3x0r/popups/popups.mjs"
import {JSOX} from "/node_modules/jsox/lib/jsox.mjs"


import {connection,openSocket,Alert} from "../login/webSocketClient.js"

const l = {
	login : null, // login form
	ws :null,     // profile service socket
	data : null,  // last profile summary from the server
	pending : new Map(), // request id -> {res,rej}
	events : {},
}

// what the form (profileForm.js) uses to talk to the service; the form is loaded
// into the popup's shadow root by fillFromURL, so it reaches this through an import.
export const profileState = {
	get data() { return l.data; },
	get connected() { return !!l.ws; },
	on( evt, cb ) {
		( l.events[evt] || ( l.events[evt] = [] ) ).push( cb );
		return cb;
	},
	off( evt, cb ) {
		const list = l.events[evt];
		if( list ) { const i = list.indexOf( cb ); if( i >= 0 ) list.splice( i, 1 ); }
	},
	emit( evt, arg ) {
		for( const cb of ( l.events[evt] || [] ) ) cb( arg );
	},
	// send an operation and get the server's result reply as a promise
	request( msg ) {
		return new Promise( ( res, rej )=>{
			if( !l.ws ) return rej( new Error( "Profile service is not connected" ) );
			msg.id = msg.id || ( "p" + Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2, 8 ) );
			l.pending.set( msg.id, { res, rej } );
			l.ws.send( JSOX.stringify( msg ) );
		} );
	},
	refresh() {
		if( l.ws ) l.ws.send( JSOX.stringify( { op:"getProfile" } ) );
	},
	logout() {
		if( l.ws ) l.ws.close( 1000, "logout" );
	},
};

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
					// worker sockets deliver through handleMessage(sock, data); the direct
					// websocket fallback honors the same property, so hook that, not onmessage.
					ws.handleMessage = ( sock, data )=>handleMessage( data );
					ws.on( "close", handleClose );
					l.ws = ws;
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
			switch( msg.op ) {
			case "profile":
				l.data = msg;
				profileState.emit( "profile", msg );
				break;
			case "result": {
				const p = l.pending.get( msg.id );
				if( p ) {
					l.pending.delete( msg.id );
					if( msg.ok ) p.res( msg ); else p.rej( new Error( msg.error || "Request failed" ) );
				} else console.log( "profile result without a request:", msg );
				break;
			}
			case "badIdentification":
				Alert( "The profile service did not accept the login key." );
				break;
			default:
				console.log( "unhandled profile message:", msg );
			}
		}
		function handleClose( code, reason ) {
			if( !l.ws ) return;
			console.log( "profile service disconnected...", code, reason );
			l.ws = null;
			l.data = null;
			for( const p of l.pending.values() ) p.rej( new Error( "disconnected" ) );
			l.pending.clear();
			profileState.emit( "disconnect" );
			this_.hide();
			login.show();
		}
	}


	#filled = false;
	load( something ) {
		// the form is attached as a shadow root once; after a logout/login cycle the
		// same ProfileContent is still listening and re-renders from the new summary.
		if( !this.#filled ) {
			this.#filled = true;
			popups.fillFromURL( this, "./profileForm.html" );
		}
		this.show();
	}
}
